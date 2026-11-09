import type { CalendarDate, MaintenanceStatus } from './types'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const LONG_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_NAMES = LONG_MONTH_NAMES.map((name) => name.slice(0, 3))

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function parts(date: CalendarDate): [year: number, month: number, day: number] {
  const match = ISO_DATE.exec(date)
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, received "${date}"`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Number of days in a month. `month` is 1-12. UTC avoids local daylight-saving effects. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** True only for a zero-padded `YYYY-MM-DD` value that names a real calendar day. */
export function isCalendarDate(value: string): value is CalendarDate {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/**
 * The user's local calendar date. It reads local year, month, and day fields.
 * It never uses `toISOString()`, which returns the UTC date.
 */
export function todayLocal(now: Date = new Date()): CalendarDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Add whole calendar months. If the source day does not exist in the target
 * month, use the target month's last day (2026-01-31 + 1 = 2026-02-28).
 */
export function addMonthsClamped(date: CalendarDate, months: number): CalendarDate {
  const [year, month, day] = parts(date)
  const monthIndex = year * 12 + (month - 1) + months
  const targetYear = Math.floor(monthIndex / 12)
  const targetMonth = (monthIndex % 12) + 1
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return `${pad(targetYear, 4)}-${pad(targetMonth)}-${pad(targetDay)}`
}

/** Compare validated, zero-padded date strings. A task due today is not overdue. */
export function getStatus(nextDue: CalendarDate, today: CalendarDate): MaintenanceStatus {
  if (nextDue < today) return 'overdue'
  if (nextDue === today) return 'due-today'
  return 'upcoming'
}

/** Display form, for example `Nov 3, 2026`. It does not create a `Date` object. */
export function formatCalendarDate(date: CalendarDate): string {
  const [year, month, day] = parts(date)
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`
}

/** Long display form, for example `November 8, 2026`. */
export function formatLongDate(date: CalendarDate): string {
  const [year, month, day] = parts(date)
  return `${LONG_MONTH_NAMES[month - 1]} ${day}, ${year}`
}
