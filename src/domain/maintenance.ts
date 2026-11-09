import { addMonthsClamped, getStatus } from './dates'
import type {
  CalendarDate,
  MaintenanceItem,
  MaintenanceRow,
  Property,
  PropertyGroup,
  TaskView,
  ViewCounts,
} from './types'

/**
 * Mark one item done on `today`. Only that item's `last_completed` changes.
 * The function never mutates its input. If nothing changes (unknown ID, or a
 * repeat on the same day), it returns the original array.
 */
export function completeItem(
  items: readonly MaintenanceItem[],
  itemId: string,
  today: CalendarDate,
): MaintenanceItem[] {
  let changed = false
  const next = items.map((item) => {
    if (item.item_id !== itemId || item.last_completed === today) return item
    changed = true
    return { ...item, last_completed: today }
  })
  return changed ? next : (items as MaintenanceItem[])
}

/** Derive the next due date, status, and completed-today flag for one item. */
export function toMaintenanceRow(item: MaintenanceItem, today: CalendarDate): MaintenanceRow {
  const next_due = addMonthsClamped(item.last_completed, item.frequency_months)
  return {
    ...item,
    next_due,
    status: getStatus(next_due, today),
    completed_today: item.last_completed === today,
  }
}

function countOverdue(rows: readonly MaintenanceRow[]): number {
  return rows.filter((row) => row.status === 'overdue').length
}

/**
 * Join each item to its property through `property_id`. Groups and rows keep
 * the source CSV order. Due dates, statuses, and counts are derived here.
 */
export function buildPropertyGroups(
  properties: readonly Property[],
  items: readonly MaintenanceItem[],
  today: CalendarDate,
): PropertyGroup[] {
  return properties.map((property) => {
    const rows = items
      .filter((item) => item.property_id === property.property_id)
      .map((item) => toMaintenanceRow(item, today))
    return {
      property,
      items: rows,
      overdueCount: countOverdue(rows),
    }
  })
}

/**
 * True when a derived row belongs in a view. Due & overdue means
 * `next_due <= today`, so it includes due-today rows.
 */
export function matchesView(row: MaintenanceRow, view: TaskView): boolean {
  if (view === 'due') return row.status !== 'upcoming'
  if (view === 'completed-today') return row.completed_today
  return true
}

/** Count the rows in each view. Pass the rows of the selected properties. */
export function countViews(rows: readonly MaintenanceRow[]): ViewCounts {
  return {
    all: rows.length,
    due: rows.filter((row) => matchesView(row, 'due')).length,
    'completed-today': rows.filter((row) => matchesView(row, 'completed-today')).length,
  }
}

/**
 * Keep only the rows in a view, in source order. Recount overdue rows for each
 * group and remove groups with no rows. The All tasks view returns the input.
 */
export function filterGroupsByView(groups: readonly PropertyGroup[], view: TaskView): PropertyGroup[] {
  if (view === 'all') return groups as PropertyGroup[]
  return groups
    .map((group) => {
      const rows = group.items.filter((row) => matchesView(row, view))
      return { ...group, items: rows, overdueCount: countOverdue(rows) }
    })
    .filter((group) => group.items.length > 0)
}
