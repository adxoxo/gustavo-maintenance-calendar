import Papa from 'papaparse'
import { isCalendarDate } from '../domain/dates'
import type { LoadResult, MaintenanceItem, Property } from '../domain/types'

export const PROPERTIES_FILE = 'sample_properties.csv'
export const ITEMS_FILE = 'sample_maintenance_items.csv'

const PROPERTY_COLUMNS = ['property_id', 'property_name', 'city', 'state'] as const
const ITEM_COLUMNS = ['item_id', 'property_id', 'task', 'category', 'frequency_months', 'last_completed'] as const

type CsvRecord = Record<string, string | undefined>

/**
 * Parse CSV text with a header row. Papa Parse handles quoted fields, LF, and
 * CRLF. Blank lines are skipped. IDs stay strings because dynamic typing is off.
 */
function parseCsv(text: string, file: string, columns: readonly string[], errors: string[]): CsvRecord[] {
  const result = Papa.parse<CsvRecord>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  })
  for (const error of result.errors) {
    const row = error.row === undefined ? '' : ` (data row ${error.row + 1})`
    errors.push(`${file}${row}: ${error.message}`)
  }
  const fields = result.meta.fields ?? []
  for (const column of columns) {
    if (!fields.includes(column)) errors.push(`${file}: missing column "${column}"`)
  }
  if (result.data.length === 0) errors.push(`${file}: the file has no data rows`)
  return result.data
}

function requireText(record: CsvRecord, column: string, where: string, errors: string[]): string {
  const value = record[column] ?? ''
  if (value === '') errors.push(`${where}: "${column}" is empty`)
  return value
}

/**
 * Validate both CSV files and return all records, or every problem found.
 * The caller must not display a partial list when `ok` is false.
 */
export function loadMaintenance(propertiesCsv: string, itemsCsv: string): LoadResult {
  const errors: string[] = []
  const propertyRecords = parseCsv(propertiesCsv, PROPERTIES_FILE, PROPERTY_COLUMNS, errors)
  const itemRecords = parseCsv(itemsCsv, ITEMS_FILE, ITEM_COLUMNS, errors)

  const properties: Property[] = []
  const propertyIds = new Set<string>()
  propertyRecords.forEach((record, index) => {
    const where = `${PROPERTIES_FILE}, data row ${index + 1}`
    const property: Property = {
      property_id: requireText(record, 'property_id', where, errors),
      property_name: requireText(record, 'property_name', where, errors),
      city: requireText(record, 'city', where, errors),
      state: requireText(record, 'state', where, errors),
    }
    if (property.property_id !== '' && propertyIds.has(property.property_id)) {
      errors.push(`${where}: duplicate property_id "${property.property_id}"`)
    }
    propertyIds.add(property.property_id)
    properties.push(property)
  })

  const items: MaintenanceItem[] = []
  const itemIds = new Set<string>()
  itemRecords.forEach((record, index) => {
    const where = `${ITEMS_FILE}, data row ${index + 1}`
    const item_id = requireText(record, 'item_id', where, errors)
    const property_id = requireText(record, 'property_id', where, errors)
    const task = requireText(record, 'task', where, errors)
    const category = requireText(record, 'category', where, errors)
    const frequency = requireText(record, 'frequency_months', where, errors)
    const last_completed = requireText(record, 'last_completed', where, errors)

    if (item_id !== '' && itemIds.has(item_id)) errors.push(`${where}: duplicate item_id "${item_id}"`)
    itemIds.add(item_id)
    if (property_id !== '' && !propertyIds.has(property_id)) {
      errors.push(`${where}: property_id "${property_id}" does not match a property`)
    }
    const frequency_months = Number(frequency)
    const validFrequency = /^\d+$/.test(frequency) && Number.isSafeInteger(frequency_months) && frequency_months > 0
    if (frequency !== '' && !validFrequency) {
      errors.push(`${where}: frequency_months "${frequency}" is not a positive whole number`)
    }
    if (last_completed !== '' && !isCalendarDate(last_completed)) {
      errors.push(`${where}: last_completed "${last_completed}" is not a real YYYY-MM-DD date`)
    }
    items.push({ item_id, property_id, task, category, frequency_months, last_completed })
  })

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: { properties, items } }
}
