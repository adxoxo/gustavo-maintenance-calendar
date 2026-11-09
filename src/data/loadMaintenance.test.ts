import { describe, expect, it } from 'vitest'
import { loadMaintenance } from './loadMaintenance'
import itemsCsv from './sample_maintenance_items.csv?raw'
import propertiesCsv from './sample_properties.csv?raw'

const PROPERTIES = 'property_id,property_name,city,state\nP1,Maple Crossing,Greenville,SC\n'
const ITEM_HEADER = 'item_id,property_id,task,category,frequency_months,last_completed\n'

function errorsFor(items: string, properties = PROPERTIES): string[] {
  const result = loadMaintenance(properties, ITEM_HEADER + items)
  if (result.ok) throw new Error('Expected the loader to reject the input')
  return result.errors
}

describe('loadMaintenance', () => {
  it('loads the supplied files, including the CRLF properties file, with string IDs and numeric frequencies', () => {
    expect(propertiesCsv).toContain('\r\n')
    const result = loadMaintenance(propertiesCsv, itemsCsv)
    if (!result.ok) throw new Error(result.errors.join('\n'))

    expect(result.data.properties).toHaveLength(5)
    expect(result.data.items).toHaveLength(15)
    expect(result.data.properties[0]).toEqual({
      property_id: 'P1',
      property_name: 'Maple Crossing',
      city: 'Greenville',
      state: 'SC',
    })
    expect(result.data.items[0]).toEqual({
      item_id: '1',
      property_id: 'P1',
      task: 'Fire alarm inspection',
      category: 'Fire and life safety',
      frequency_months: 12,
      last_completed: '2025-11-03',
    })
  })

  it('handles CRLF, blank lines, and a quoted comma', () => {
    const properties = 'property_id,property_name,city,state\r\n\r\nP1,"Maple Crossing, North",Greenville,SC\r\n\r\n'
    const items = ITEM_HEADER.replace('\n', '\r\n') + '\r\n1,P1,"Inspect roof, gutters",Roof,6,2026-05-31\r\n\r\n'
    const result = loadMaintenance(properties, items)
    if (!result.ok) throw new Error(result.errors.join('\n'))

    expect(result.data.properties[0]?.property_name).toBe('Maple Crossing, North')
    expect(result.data.properties[0]?.state).toBe('SC')
    expect(result.data.items).toEqual([
      {
        item_id: '1',
        property_id: 'P1',
        task: 'Inspect roof, gutters',
        category: 'Roof',
        frequency_months: 6,
        last_completed: '2026-05-31',
      },
    ])
  })

  it.each([
    ['an impossible date', '1,P1,Roof inspection,Roof,6,2026-02-30\n', 'last_completed "2026-02-30"'],
    ['a zero frequency', '1,P1,Roof inspection,Roof,0,2026-05-01\n', 'frequency_months "0"'],
    ['a fractional frequency', '1,P1,Roof inspection,Roof,1.5,2026-05-01\n', 'frequency_months "1.5"'],
    ['an unsafe frequency', `1,P1,Roof inspection,Roof,${'9'.repeat(400)},2026-05-01\n`, 'frequency_months'],
    ['an unknown property', '1,P9,Roof inspection,Roof,6,2026-05-01\n', 'property_id "P9" does not match'],
    ['a duplicate item ID', '1,P1,Roof,Roof,6,2026-05-01\n1,P1,Gutters,Roof,6,2026-05-01\n', 'duplicate item_id "1"'],
    ['an empty task', '1,P1,,Roof,6,2026-05-01\n', '"task" is empty'],
    ['a missing field', '1,P1,Roof inspection,Roof,6\n', 'Too few fields'],
  ])('rejects %s with a visible error', (_case, items, message) => {
    expect(errorsFor(items).join('\n')).toContain(message)
  })

  it('rejects a duplicate property ID and a missing column', () => {
    const duplicate = PROPERTIES + 'P1,Other,Tampa,FL\n'
    expect(errorsFor('1,P1,Roof,Roof,6,2026-05-01\n', duplicate).join('\n')).toContain('duplicate property_id "P1"')

    const result = loadMaintenance('property_id,property_name,city\nP1,Maple,Greenville\n', ITEM_HEADER)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('sample_properties.csv: missing column "state"')
  })
})
