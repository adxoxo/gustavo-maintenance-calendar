import { loadMaintenance } from './loadMaintenance'
import itemsCsv from './sample_maintenance_items.csv?raw'
import propertiesCsv from './sample_properties.csv?raw'

/**
 * Vite bundles both CSV files as text. The loader runs once per page load,
 * so a refresh always starts again from the unchanged source files.
 */
export const sourceData = loadMaintenance(propertiesCsv, itemsCsv)
