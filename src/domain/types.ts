/** A calendar date in `YYYY-MM-DD` form, with no time and no time zone. */
export type CalendarDate = string

export type MaintenanceStatus = 'overdue' | 'due-today' | 'upcoming'

/**
 * A list view. `due` shows rows with `next_due` on or before today.
 * `completed-today` shows rows with `last_completed` equal to today.
 */
export type TaskView = 'all' | 'due' | 'completed-today'

/** One row of `sample_properties.csv`. Properties never change at runtime. */
export interface Property {
  property_id: string
  property_name: string
  city: string
  state: string
}

/** One row of `sample_maintenance_items.csv`, after validation. */
export interface MaintenanceItem {
  item_id: string
  property_id: string
  task: string
  category: string
  frequency_months: number
  last_completed: CalendarDate
}

/** A maintenance item plus values derived for display. Never stored in state. */
export interface MaintenanceRow extends MaintenanceItem {
  next_due: CalendarDate
  status: MaintenanceStatus
  /** True when `last_completed` is today. A recurring task still has a next due date. */
  completed_today: boolean
}

/** One property and its derived rows, in source CSV order. */
export interface PropertyGroup {
  property: Property
  items: MaintenanceRow[]
  overdueCount: number
}

/** Number of rows in each view, before the view filter applies. */
export type ViewCounts = Record<TaskView, number>

export interface MaintenanceData {
  properties: Property[]
  items: MaintenanceItem[]
}

export type LoadResult =
  | { ok: true; data: MaintenanceData }
  | { ok: false; errors: string[] }
