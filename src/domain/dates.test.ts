import { describe, expect, it } from 'vitest'
import { addMonthsClamped, getStatus, isCalendarDate, todayLocal } from './dates'

describe('addMonthsClamped', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-12-31', 2, '2027-02-28'],
    ['2026-11-08', 12, '2027-11-08'],
    // Supplied month-end items 2, 3, 11, and 15.
    ['2026-10-31', 1, '2026-11-30'],
    ['2026-08-31', 3, '2026-11-30'],
    ['2026-05-31', 6, '2026-11-30'],
    ['2026-08-31', 6, '2027-02-28'],
  ])('%s plus %i months is %s', (date, months, expected) => {
    expect(addMonthsClamped(date, months)).toBe(expected)
  })
})

describe('getStatus', () => {
  it('treats due today as not overdue, yesterday as overdue, and tomorrow as upcoming', () => {
    expect(getStatus('2026-11-08', '2026-11-08')).toBe('due-today')
    expect(getStatus('2026-11-07', '2026-11-08')).toBe('overdue')
    expect(getStatus('2026-11-09', '2026-11-08')).toBe('upcoming')
    expect(getStatus('2026-12-31', '2027-01-01')).toBe('overdue')
  })
})

describe('todayLocal', () => {
  it('uses local calendar fields near midnight, not the UTC date', () => {
    expect(todayLocal(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08')
    expect(todayLocal(new Date(2026, 10, 8, 0, 1))).toBe('2026-11-08')
  })
})

describe('isCalendarDate', () => {
  it('accepts only real zero-padded dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('2026-1-05')).toBe(false)
    expect(isCalendarDate('11/08/2026')).toBe(false)
  })
})
