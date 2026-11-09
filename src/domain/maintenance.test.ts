import { describe, expect, it } from 'vitest'
import { sourceData } from '../data/source'
import { buildPropertyGroups, completeItem, countViews, filterGroupsByView, matchesView, toMaintenanceRow } from './maintenance'
import type { MaintenanceData } from './types'

const TODAY = '2026-11-08'

function supplied(): MaintenanceData {
  if (!sourceData.ok) throw new Error(sourceData.errors.join('\n'))
  return sourceData.data
}

describe('buildPropertyGroups with the supplied CSVs', () => {
  it('groups fifteen tasks under five properties in source order', () => {
    const { properties, items } = supplied()
    const groups = buildPropertyGroups(properties, items, TODAY)
    expect(groups.map((group) => group.property.property_id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
    expect(groups.flatMap((group) => group.items.map((row) => row.item_id))).toEqual(
      Array.from({ length: 15 }, (_, index) => String(index + 1)),
    )
    for (const group of groups) {
      expect(group.items.every((row) => row.property_id === group.property.property_id)).toBe(true)
    }
  })

  it('flags exactly items 1, 5, 6, 9, 13, and 14 as overdue on 2026-11-08', () => {
    const { properties, items } = supplied()
    const rows = buildPropertyGroups(properties, items, TODAY).flatMap((group) => group.items)
    expect(rows.filter((row) => row.status === 'overdue').map((row) => row.item_id)).toEqual([
      '1', '5', '6', '9', '13', '14',
    ])
    expect(rows.find((row) => row.item_id === '15')?.next_due).toBe('2027-02-28')
  })
})

describe('completeItem', () => {
  it('changes only the selected last_completed value and does not mutate the input', () => {
    const { items } = supplied()
    const before = structuredClone(items)
    const next = completeItem(items, '1', TODAY)

    expect(items).toEqual(before)
    expect(next[0]).toEqual({ ...before[0], last_completed: TODAY })
    expect(next.slice(1)).toEqual(before.slice(1))
    next.slice(1).forEach((item, index) => expect(item).toBe(items[index + 1]))
  })

  it('does not advance a task again on a same-day repeat, and ignores an unknown ID', () => {
    const { items } = supplied()
    const once = completeItem(items, '1', TODAY)
    expect(completeItem(once, '1', TODAY)).toBe(once)
    expect(completeItem(items, 'missing', TODAY)).toBe(items)
  })
})

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value')
  return value
}

describe('views', () => {
  function rowsOn(today: string) {
    const { properties, items } = supplied()
    return buildPropertyGroups(properties, items, today)
  }

  it('flags completed_today only when last_completed equals today, and keeps a next due date', () => {
    const item2 = present(supplied().items[1])
    const row = toMaintenanceRow(item2, '2026-10-31')
    expect(row.completed_today).toBe(true)
    expect(row.next_due).toBe('2026-11-30')
    expect(row.status).toBe('upcoming')
    expect(toMaintenanceRow(item2, '2026-11-01').completed_today).toBe(false)
  })

  it('includes due today in Due & overdue, and excludes tomorrow', () => {
    const rows = rowsOn('2026-11-20').flatMap((group) => group.items)
    const due = rows.filter((row) => matchesView(row, 'due')).map((row) => row.item_id)
    expect(due).toEqual(['1', '4', '5', '6', '8', '9', '10', '13', '14'])
    const before = rowsOn('2026-11-19').flatMap((group) => group.items)
    expect(before.filter((row) => matchesView(row, 'due')).map((row) => row.item_id)).not.toContain('4')
  })

  it('counts each view from the rows it receives', () => {
    const groups = rowsOn(TODAY)
    expect(countViews(groups.flatMap((group) => group.items))).toEqual({ all: 15, due: 6, 'completed-today': 0 })
    expect(countViews(present(groups[4]).items)).toEqual({ all: 3, due: 2, 'completed-today': 0 })
    const { properties, items } = supplied()
    const done = buildPropertyGroups(properties, completeItem(items, '7', TODAY), TODAY)
    expect(countViews(done.flatMap((group) => group.items))).toEqual({ all: 15, due: 6, 'completed-today': 1 })
  })

  it('filters rows in source order, recounts overdue rows, and removes empty groups', () => {
    const groups = rowsOn(TODAY)
    expect(filterGroupsByView(groups, 'all')).toBe(groups)

    const due = filterGroupsByView(groups, 'due')
    expect(due.map((group) => group.property.property_id)).toEqual(['P1', 'P2', 'P3', 'P5'])
    expect(due.map((group) => group.items.map((row) => row.item_id))).toEqual([['1'], ['5', '6'], ['9'], ['13', '14']])
    expect(due.map((group) => group.overdueCount)).toEqual([1, 2, 1, 2])
    expect(present(due[0]).property).toBe(present(groups[0]).property)

    expect(filterGroupsByView(groups, 'completed-today')).toEqual([])
  })
})
