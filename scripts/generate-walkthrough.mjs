// Generate public/developer-walkthrough.html from the actual app source.
//
//   npm run docs          write the file
//   npm run docs:check    fail if the file is out of date
//
// Every path:line reference comes from the TypeScript AST or the CSV header.
// The output is one offline HTML file. It embeds the referenced source files,
// the Geist fonts, its styles, and its script. It makes no network request.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SourceIndex,
  SyntaxKind as K,
  findCalls,
  findCsvColumn,
  findDeclaration,
  findMember,
  findNode,
  signatureOf,
  verifyReference,
} from './source-refs.mjs'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const OUTPUT = 'public/developer-walkthrough.html'

const FILES = {
  source: 'src/data/source.ts',
  loader: 'src/data/loadMaintenance.ts',
  propertiesCsv: 'src/data/sample_properties.csv',
  itemsCsv: 'src/data/sample_maintenance_items.csv',
  types: 'src/domain/types.ts',
  dates: 'src/domain/dates.ts',
  maintenance: 'src/domain/maintenance.ts',
  app: 'src/App.tsx',
  section: 'src/components/PropertySection.tsx',
  row: 'src/components/MaintenanceRow.tsx',
  error: 'src/components/DataError.tsx',
}
const TS_FILES = Object.values(FILES).filter((file) => /\.tsx?$/.test(file))
const EXCERPT_LIMIT = 32

// ---------------------------------------------------------------------------
// Reference resolution
// ---------------------------------------------------------------------------

export function resolveReferences(appRoot = APP_ROOT) {
  const index = new SourceIndex(appRoot)
  const refs = {}

  function add(id, file, node, label, role, expect) {
    const span = index.span(file, node)
    const line = index.lineOf(file, node.name && node.kind !== K.VariableDeclaration ? node.name : node)
    const firstLine = node.getText().split('\n')[0].trim()
    const ref = { id, file, line, start: span.start, end: span.end, label, role, expect: expect ?? firstLine }
    verifyReference(index, ref)
    refs[id] = ref
    return ref
  }

  const fn = (id, file, name, label = `${name}()`) => add(id, file, findDeclaration(index, file, name), label, 'declaration', name)
  const typeDecl = (id, file, name) => add(id, file, findDeclaration(index, file, name), name, 'type definition', name)
  const member = (id, file, iface, name) =>
    add(id, file, findMember(index, file, iface, name), `${iface}.${name}`, 'type definition', `${name}:`)
  const node = (id, file, query, label, role) => add(id, file, findNode(index, file, query), label, role)
  const csv = (id, file, column) => {
    const { line, column: position } = findCsvColumn(index, file, column)
    const ref = { id, file, line, start: line, end: line, label: `${column} (column ${position})`, role: 'source CSV column', expect: column }
    verifyReference(index, ref)
    refs[id] = ref
  }

  // Functions and components.
  fn('fn.loadMaintenance', FILES.loader, 'loadMaintenance')
  fn('fn.parseCsv', FILES.loader, 'parseCsv')
  fn('fn.todayLocal', FILES.dates, 'todayLocal')
  fn('fn.isCalendarDate', FILES.dates, 'isCalendarDate')
  fn('fn.addMonthsClamped', FILES.dates, 'addMonthsClamped')
  fn('fn.getStatus', FILES.dates, 'getStatus')
  fn('fn.completeItem', FILES.maintenance, 'completeItem')
  fn('fn.toMaintenanceRow', FILES.maintenance, 'toMaintenanceRow')
  fn('fn.buildPropertyGroups', FILES.maintenance, 'buildPropertyGroups')
  fn('fn.matchesView', FILES.maintenance, 'matchesView')
  fn('fn.countViews', FILES.maintenance, 'countViews')
  fn('fn.filterGroupsByView', FILES.maintenance, 'filterGroupsByView')
  fn('fn.App', FILES.app, 'App', 'App')
  fn('fn.MaintenanceCalendar', FILES.app, 'MaintenanceCalendar', 'MaintenanceCalendar')
  fn('fn.handleMarkDone', FILES.app, 'handleMarkDone')
  fn('fn.refreshToday', FILES.app, 'refreshToday')
  fn('fn.handleViewCompletedToday', FILES.app, 'handleViewCompletedToday')
  fn('fn.handleDismiss', FILES.app, 'handleDismiss')
  fn('fn.handleResetFilters', FILES.app, 'handleResetFilters')
  fn('fn.PropertySection', FILES.section, 'PropertySection', 'PropertySection')
  fn('fn.MaintenanceRow', FILES.row, 'MaintenanceRow', 'MaintenanceRow')
  fn('fn.DataError', FILES.error, 'DataError', 'DataError')
  add('const.sourceData', FILES.source, findDeclaration(index, FILES.source, 'sourceData'), 'sourceData', 'declaration', 'sourceData')

  // Types.
  for (const name of ['CalendarDate', 'MaintenanceStatus', 'TaskView', 'Property', 'MaintenanceItem', 'MaintenanceRow', 'PropertyGroup', 'ViewCounts', 'LoadResult']) {
    typeDecl(`type.${name}`, FILES.types, name)
  }
  for (const name of ['property_id', 'property_name', 'city', 'state']) {
    member(`field.Property.${name}`, FILES.types, 'Property', name)
    csv(`csv.properties.${name}`, FILES.propertiesCsv, name)
  }
  for (const name of ['item_id', 'property_id', 'task', 'category', 'frequency_months', 'last_completed']) {
    member(`field.MaintenanceItem.${name}`, FILES.types, 'MaintenanceItem', name)
    csv(`csv.items.${name}`, FILES.itemsCsv, name)
  }
  member('field.MaintenanceRow.next_due', FILES.types, 'MaintenanceRow', 'next_due')
  member('field.MaintenanceRow.status', FILES.types, 'MaintenanceRow', 'status')
  member('field.MaintenanceRow.completed_today', FILES.types, 'MaintenanceRow', 'completed_today')
  for (const name of ['property', 'items', 'overdueCount']) member(`field.PropertyGroup.${name}`, FILES.types, 'PropertyGroup', name)

  // Data path: imports, parsing, validation.
  node('import.itemsCsv', FILES.source, { kind: K.ImportDeclaration, startsWith: 'import itemsCsv' }, 'items CSV ?raw import', 'Vite raw import')
  node('import.propertiesCsv', FILES.source, { kind: K.ImportDeclaration, startsWith: 'import propertiesCsv' }, 'properties CSV ?raw import', 'Vite raw import')
  node('call.loadMaintenance', FILES.source, { kind: K.CallExpression, startsWith: 'loadMaintenance(' }, 'loadMaintenance(propertiesCsv, itemsCsv)', 'call site')
  node('call.papaParse', FILES.loader, { kind: K.CallExpression, startsWith: 'Papa.parse<' }, 'Papa.parse()', 'CSV parser call')
  node('loader.unknownProperty', FILES.loader, { kind: K.PrefixUnaryExpression, text: '!propertyIds.has(property_id)', within: 'loadMaintenance' }, 'unknown property check', 'validation')
  node('loader.duplicateItem', FILES.loader, { kind: K.CallExpression, text: 'itemIds.has(item_id)', within: 'loadMaintenance' }, 'duplicate item_id check', 'validation')
  node('loader.frequency', FILES.loader, { kind: K.VariableDeclaration, text: 'frequency_months = Number(frequency)', within: 'loadMaintenance' }, 'frequency text → number', 'conversion')
  node('loader.validFrequency', FILES.loader, { kind: K.VariableDeclaration, startsWith: 'validFrequency =', within: 'loadMaintenance' }, 'positive safe integer check', 'validation')
  node('loader.date', FILES.loader, { kind: K.CallExpression, text: 'isCalendarDate(last_completed)', within: 'loadMaintenance' }, 'real date check', 'validation')
  node('loader.result', FILES.loader, { kind: K.ReturnStatement, startsWith: 'return errors.length > 0', within: 'loadMaintenance' }, 'LoadResult return', 'result')

  // App state and handlers.
  node('app.sourceSwitch', FILES.app, { kind: K.ConditionalExpression, startsWith: 'source.ok ?', within: 'App' }, 'error panel or calendar', 'branch')
  node('state.items', FILES.app, { kind: K.VariableDeclaration, text: '[items, setItems] = useState(data.items)' }, 'useState(data.items)', 'state declaration')
  node('state.today', FILES.app, { kind: K.VariableDeclaration, text: '[today, setToday] = useState(() => todayLocal())' }, 'useState(() => todayLocal())', 'state declaration')
  node('state.propertyFilter', FILES.app, { kind: K.VariableDeclaration, text: '[propertyFilter, setPropertyFilter] = useState(ALL_PROPERTIES)' }, 'useState(ALL_PROPERTIES)', 'state declaration')
  node('state.view', FILES.app, { kind: K.VariableDeclaration, text: "[view, setView] = useState<TaskView>('all')" }, "useState<TaskView>('all')", 'state declaration')
  node('state.lastCompletedId', FILES.app, { kind: K.VariableDeclaration, startsWith: '[lastCompletedId, setLastCompletedId] =' }, 'useState(null): row highlight', 'state declaration')
  node('state.confirmationId', FILES.app, { kind: K.VariableDeclaration, startsWith: '[confirmationId, setConfirmationId] =' }, 'useState(null): confirmation', 'state declaration')
  node('state.focusCheckId', FILES.app, { kind: K.VariableDeclaration, startsWith: 'focusCheckId = useRef' }, 'useRef(null): focus check after completion', 'state declaration')
  node('effect.refreshToday', FILES.app, { kind: K.CallExpression, startsWith: 'useEffect(', within: 'MaintenanceCalendar', nth: 0 }, 'focus and visibility listeners', 'effect')
  node('effect.focusAfterCompletion', FILES.app, { kind: K.CallExpression, startsWith: 'useEffect(', within: 'MaintenanceCalendar', nth: 1 }, 'focus the View select when the row leaves the view', 'effect')
  node('handler.actionDate', FILES.app, { kind: K.VariableDeclaration, text: 'actionDate = todayLocal()', within: 'handleMarkDone' }, 'const actionDate = todayLocal()', 'clock read')
  node('handler.guard', FILES.app, { kind: K.IfStatement, startsWith: 'if (!item ||', within: 'handleMarkDone' }, 'ignore Completed today and same-day repeats', 'guard')
  node('handler.setItems', FILES.app, { kind: K.CallExpression, startsWith: 'setItems(', within: 'handleMarkDone' }, 'setItems(previous => completeItem(…))', 'state write')
  node('handler.setConfirmation', FILES.app, { kind: K.CallExpression, text: 'setConfirmationId(itemId)', within: 'handleMarkDone' }, 'setConfirmationId(itemId)', 'state write')
  node('handler.focusCheck', FILES.app, { kind: K.BinaryExpression, text: 'focusCheckId.current = itemId', within: 'handleMarkDone' }, 'focusCheckId.current = itemId', 'state write')
  node('handler.showDone', FILES.app, { kind: K.CallExpression, text: "setView('completed-today')", within: 'handleViewCompletedToday' }, "setView('completed-today')", 'state write')
  node('app.groups', FILES.app, { kind: K.VariableDeclaration, startsWith: 'groups = useMemo(' }, 'buildPropertyGroups() in useMemo', 'call site')
  node('app.overdueTotal', FILES.app, { kind: K.VariableDeclaration, startsWith: 'overdueTotal =' }, 'portfolio overdue count', 'derived value')
  node('app.propertyGroups', FILES.app, { kind: K.VariableDeclaration, startsWith: 'propertyGroups =' }, 'property filter', 'derived value')
  node('app.viewCounts', FILES.app, { kind: K.VariableDeclaration, startsWith: 'viewCounts = countViews(' }, 'View option counts', 'derived value')
  node('app.visibleGroups', FILES.app, { kind: K.VariableDeclaration, startsWith: 'visibleGroups = filterGroupsByView(' }, 'view filter', 'derived value')
  node('app.completed', FILES.app, { kind: K.VariableDeclaration, startsWith: 'completed = groups' }, 'confirmation source', 'derived value')
  node('app.toast', FILES.app, { kind: K.JsxElement, startsWith: '<div role="status"' }, 'floating confirmation', 'rendered')
  node('jsx.viewSelect', FILES.app, { kind: K.JsxElement, startsWith: '<select id="view-filter"' }, 'View select with counts', 'rendered')
  node('jsx.viewDone', FILES.app, { kind: K.JsxElement, startsWith: '<button type="button" className="view-done"' }, 'View completed today action', 'rendered')
  node('jsx.dismiss', FILES.app, { kind: K.JsxElement, startsWith: '<button type="button" className="dismiss"' }, 'Dismiss confirmation', 'rendered')
  node('jsx.emptyState', FILES.app, { kind: K.JsxElement, startsWith: '<section className="no-results"' }, 'empty view with Show all tasks', 'rendered')
  node('jsx.PropertySection', FILES.app, { kind: K.JsxSelfClosingElement, startsWith: '<PropertySection' }, '<PropertySection … />', 'component call site')
  node('jsx.onMarkDone.app', FILES.app, { kind: K.JsxAttribute, text: 'onMarkDone={handleMarkDone}' }, 'onMarkDone={handleMarkDone}', 'handler passed down')
  node('jsx.MaintenanceRow', FILES.section, { kind: K.JsxSelfClosingElement, startsWith: '<MaintenanceRow' }, '<MaintenanceRow … />', 'component call site')
  node('jsx.onMarkDone.section', FILES.section, { kind: K.JsxAttribute, text: 'onMarkDone={onMarkDone}' }, 'onMarkDone={onMarkDone}', 'handler passed down')
  node('jsx.rowKey', FILES.section, { kind: K.JsxAttribute, text: 'key={row.item_id}' }, 'key={row.item_id}', 'React key')
  node('jsx.overdueCount', FILES.section, { kind: K.JsxElement, startsWith: '<strong data-testid' }, 'property overdue count', 'rendered')
  node('jsx.propertyName', FILES.section, { kind: K.JsxElement, startsWith: '<h2 id={headingId}>' }, 'property heading', 'rendered')
  node('jsx.location', FILES.section, { kind: K.JsxElement, startsWith: '<p className="location">' }, 'city and state', 'rendered')
  node('jsx.button', FILES.row, { kind: K.JsxElement, startsWith: '<button type="button" className="done"' }, 'Mark done button', 'rendered')
  node('row.actionText', FILES.row, { kind: K.VariableDeclaration, startsWith: 'actionText =' }, 'Mark done or Completed today', 'derived value')
  node('jsx.ariaLabel', FILES.row, { kind: K.JsxAttribute, startsWith: 'aria-label={`${actionText}:' }, 'aria-label with task and property', 'accessible name')
  node('jsx.ariaDisabled', FILES.row, { kind: K.JsxAttribute, startsWith: 'aria-disabled=' }, 'aria-disabled when completed today', 'accessible state')
  node('jsx.onClick', FILES.row, { kind: K.JsxAttribute, text: 'onClick={() => onMarkDone(row.item_id)}' }, 'onClick → onMarkDone(row.item_id)', 'event handler')
  node('jsx.taskName', FILES.row, { kind: K.JsxElement, text: '<p className="task-name">{row.task}</p>' }, 'task name', 'rendered')
  node('jsx.category', FILES.row, { kind: K.JsxElement, startsWith: '<p className="category">' }, 'category', 'rendered')
  node('jsx.frequency', FILES.row, { kind: K.JsxElement, startsWith: '<p className="datum frequency">' }, 'frequency', 'rendered')
  node('jsx.last', FILES.row, { kind: K.JsxElement, startsWith: '<p className="datum last">' }, 'last completed date', 'rendered')
  node('jsx.next', FILES.row, { kind: K.JsxElement, startsWith: '<p className="datum next">' }, 'next due date', 'rendered')
  node('jsx.status', FILES.row, { kind: K.JsxElement, startsWith: '<p className="status">' }, 'status badge', 'rendered')

  // Domain internals.
  node('domain.stateWrite', FILES.maintenance, { kind: K.PropertyAssignment, text: 'last_completed: today', within: 'completeItem' }, 'last_completed: today', 'state write')
  node('domain.itemMatch', FILES.maintenance, { kind: K.BinaryExpression, text: 'item.item_id !== itemId', within: 'completeItem' }, 'item.item_id !== itemId', 'completion target')
  node('domain.join', FILES.maintenance, { kind: K.BinaryExpression, text: 'item.property_id === property.property_id', within: 'buildPropertyGroups' }, 'item.property_id === property.property_id', 'join')
  node('domain.nextDue', FILES.maintenance, { kind: K.VariableDeclaration, startsWith: 'next_due = addMonthsClamped(', within: 'toMaintenanceRow' }, 'next_due = addMonthsClamped(…)', 'derived value')
  node('domain.status', FILES.maintenance, { kind: K.CallExpression, text: 'getStatus(next_due, today)', within: 'toMaintenanceRow' }, 'getStatus(next_due, today)', 'derived value')
  node('domain.completedToday', FILES.maintenance, { kind: K.PropertyAssignment, text: 'completed_today: item.last_completed === today', within: 'toMaintenanceRow' }, 'completed_today: last_completed === today', 'derived value')
  node('domain.viewDue', FILES.maintenance, { kind: K.IfStatement, startsWith: "if (view === 'due')", within: 'matchesView' }, "due → status !== 'upcoming'", 'comparison')
  node('domain.viewDone', FILES.maintenance, { kind: K.IfStatement, startsWith: "if (view === 'completed-today')", within: 'matchesView' }, 'completed-today → row.completed_today', 'comparison')
  node('domain.dropEmpty', FILES.maintenance, { kind: K.BinaryExpression, text: 'group.items.length > 0', within: 'filterGroupsByView' }, 'remove empty property groups', 'derived value')
  node('domain.overdueCount', FILES.maintenance, { kind: K.PropertyAssignment, startsWith: 'overdueCount:', within: 'buildPropertyGroups' }, 'overdueCount', 'derived value')
  node('domain.groupProperty', FILES.maintenance, { kind: K.ShorthandPropertyAssignment, text: 'property', within: 'buildPropertyGroups' }, 'property', 'derived value')
  node('domain.groupItems', FILES.maintenance, { kind: K.PropertyAssignment, text: 'items: rows', within: 'buildPropertyGroups' }, 'items: rows', 'derived value')
  node('domain.clamp', FILES.dates, { kind: K.VariableDeclaration, startsWith: 'targetDay = Math.min(', within: 'addMonthsClamped' }, 'Math.min(day, daysInMonth(…))', 'clamp')
  node('domain.overdueCompare', FILES.dates, { kind: K.IfStatement, startsWith: "if (nextDue < today) return 'overdue'", within: 'getStatus' }, "nextDue < today → 'overdue'", 'comparison')

  return { index, refs }
}

// ---------------------------------------------------------------------------
// Document content
// ---------------------------------------------------------------------------

const item = { item_id: '1', property_id: 'P1', task: 'Fire alarm inspection', category: 'Fire and life safety', frequency_months: 12, last_completed: '2025-11-03' }
const prop = { property_id: 'P1', property_name: 'Maple Crossing', city: 'Greenville', state: 'SC' }
const oldRow = { ...item, next_due: '2026-11-03', status: 'overdue', completed_today: false }
const newItem = { ...item, last_completed: '2026-11-08' }
const newRow = { ...newItem, next_due: '2027-11-08', status: 'upcoming', completed_today: true }

const step = (title, node, functionLabel, description, excerpt, refs, snapshotTitle, snapshot) =>
  ({ title, node, function: functionLabel, description, excerpt, refs, snapshotTitle, snapshot })

const FLOWS = {
  load: {
    title: 'Read the CSVs and show properties',
    intro: 'Follow the source data from the bundle to a property section. There is no data API request.',
    steps: [
      step('Bundle the CSV files', 'assets', 'Vite ?raw imports → sourceData',
        'Vite turns both CSV files into text exports. The data module calls the loader once per page load. A refresh runs it again from the unchanged files.',
        { file: FILES.source, from: 'import.itemsCsv', to: 'const.sourceData' },
        ['import.itemsCsv', 'import.propertiesCsv', 'call.loadMaintenance', 'csv.properties.property_id', 'csv.items.item_id'],
        'Two text inputs', {
          propertiesCsv: 'property_id,property_name,city,state\nP1,Maple Crossing,Greenville,SC\n…',
          itemsCsv: 'item_id,property_id,task,category,frequency_months,last_completed\n1,P1,Fire alarm inspection,Fire and life safety,12,2025-11-03\n…',
        }),
      step('Parse and validate', 'loader', 'loadMaintenance(propertiesCsv, itemsCsv)',
        'Papa Parse reads CSV syntax, including quotes, LF, and CRLF. The loader checks every field and property reference. It converts frequency_months to a number. Any problem returns errors instead of data.',
        { file: FILES.loader, from: 'fn.parseCsv', to: 'fn.parseCsv' },
        ['fn.loadMaintenance', 'fn.parseCsv', 'call.papaParse', 'loader.unknownProperty', 'loader.frequency', 'loader.date', 'loader.result'],
        'Successful loader result, one record from each array', { ok: true, data: { properties: [prop], items: [item] } }),
      step('Initialize page state', 'state', 'useState(data.items) + useState(() => todayLocal())',
        'App shows the error panel when the result is not ok. Otherwise properties stay fixed, and React holds the item array and today. UI state holds the property filter, the view, the highlighted row, and the confirmation. This example freezes today at November 8, 2026.',
        { file: FILES.app, from: 'fn.MaintenanceCalendar', to: 'effect.refreshToday' },
        ['app.sourceSwitch', 'fn.MaintenanceCalendar', 'state.items', 'state.today', 'state.propertyFilter', 'state.view', 'effect.refreshToday', 'fn.DataError'],
        'App state and fixed property reference', { properties: '5 fixed property records', items: '15 mutable maintenance records', today: '2026-11-08', propertyFilter: 'all', view: 'all', lastCompletedId: null, confirmationId: null }),
      step('Calculate each due date', 'domain', 'toMaintenanceRow() → addMonthsClamped() + getStatus()',
        'Add the task frequency to last_completed. Clamp to the final day of the target month. Compare the result with today. A row is completed today when last_completed equals today.',
        { file: FILES.maintenance, from: 'fn.toMaintenanceRow', to: 'fn.toMaintenanceRow' },
        ['fn.toMaintenanceRow', 'fn.addMonthsClamped', 'domain.clamp', 'fn.getStatus', 'domain.completedToday'],
        'Derived row, not a second state object', oldRow),
      step('Join items to properties', 'domain', 'buildPropertyGroups(properties, items, today)',
        'Match item.property_id to property.property_id. P1 selects Maple Crossing. Its section contains items 1, 2, and 3.',
        { file: FILES.maintenance, from: 'fn.buildPropertyGroups', to: 'fn.buildPropertyGroups' },
        ['fn.buildPropertyGroups', 'domain.join', 'domain.overdueCount', 'app.groups'],
        'Property group, abbreviated to identifiers', { property: prop, items: ['1', '2', '3'], overdueCount: 1, note: 'The real group holds complete derived rows.' }),
      step('Filter and display sections', 'ui', 'countViews() → filterGroupsByView() → PropertySection',
        'The property filter runs first. The View counts use those rows. The view filter then keeps matching rows in source order and removes empty sections. With no rows, an empty state offers Show all tasks. The default shows five sections and fifteen rows.',
        { file: FILES.app, from: 'app.propertyGroups', to: 'app.visibleGroups' },
        ['app.propertyGroups', 'app.viewCounts', 'fn.countViews', 'app.visibleGroups', 'fn.filterGroupsByView', 'jsx.emptyState', 'jsx.PropertySection', 'jsx.rowKey'],
        'Visible result at the fixed example date', { property_sections: 5, maintenance_rows: 15, overdue_items: 6, maple_crossing_overdue: 1, view_options: ['All tasks (15)', 'Due & overdue (6)', 'Completed today (0)'] }),
    ],
  },
  click: {
    title: 'Trace a Mark done click',
    intro: 'Follow item 1 at Maple Crossing. The example date stays fixed at November 8, 2026.',
    steps: [
      step('Pass the selected item ID', 'ui', 'onClick → onMarkDone("1") → handleMarkDone("1")',
        'The button sends item_id, not the task name or its array position. Its aria-label starts with the visible text and adds the task and property, so each button has a distinct accessible name. A row completed today shows Completed today with aria-disabled. It keeps keyboard focus.',
        { file: FILES.row, from: 'jsx.button', to: 'jsx.button' },
        ['jsx.onClick', 'row.actionText', 'jsx.ariaLabel', 'jsx.ariaDisabled', 'jsx.onMarkDone.section', 'jsx.onMarkDone.app', 'fn.handleMarkDone'],
        'Click payload', { itemId: '1', property_id: 'P1', accessible_name: 'Mark done: Fire alarm inspection at Maple Crossing' }),
      step('Capture one local date', 'state', 'handleMarkDone() → todayLocal()',
        'Read the clock once, outside the updater. Use that same date for the completion and for all status comparisons. Stop if the item was already completed on that date. Otherwise set the highlight, the confirmation, and a focus check.',
        { file: FILES.app, from: 'fn.handleMarkDone', to: 'fn.handleMarkDone' },
        ['fn.handleMarkDone', 'handler.actionDate', 'fn.todayLocal', 'handler.guard', 'handler.setItems', 'handler.setConfirmation', 'handler.focusCheck'],
        'Handler values', { itemId: '1', actionDate: '2026-11-08', clock_reads_per_action: 1, already_completed_on_actionDate: false }),
      step('Create the next item array', 'domain', 'completeItem(previous, "1", "2026-11-08")',
        'The updater receives the latest array. Copy the matching item and change only last_completed. Keep the other fourteen objects. A same-day repeat returns the array unchanged.',
        { file: FILES.maintenance, from: 'fn.completeItem', to: 'fn.completeItem' },
        ['fn.completeItem', 'domain.itemMatch', 'domain.stateWrite', 'handler.setItems'],
        'Updater result, selected item only', newItem),
      step('Render with the new state', 'state', 'React state update → next render',
        'React uses the queued state for the next render. No HTTP call or CSV write occurs. useMemo derives the groups again from the new items and today. The View counts and the visible groups derive again too.',
        { file: FILES.app, from: 'app.groups', to: 'app.completed' },
        ['app.groups', 'fn.buildPropertyGroups', 'app.overdueTotal', 'app.viewCounts', 'app.visibleGroups', 'fn.matchesView', 'app.completed'],
        'Inputs to the next render', { today: '2026-11-08', 'items[0].last_completed': '2026-11-08', other_item_values: 'unchanged', view: 'all', confirmationId: '1', server_requests_from_click: 0 }),
      step('Derive the new due date', 'domain', 'addMonthsClamped() → getStatus()',
        'Twelve months after the new completion date is November 8, 2027. Its status becomes upcoming. The row is completed today, but it is not permanently complete: it still has a next due date. No stored due date needs synchronization.',
        { file: FILES.dates, from: 'fn.addMonthsClamped', to: 'fn.getStatus' },
        ['fn.addMonthsClamped', 'fn.getStatus', 'domain.nextDue', 'domain.status', 'domain.completedToday'],
        'New derived row', newRow),
      step('Update the row and confirm', 'ui', 'Updated props → DOM update',
        'The row shows its new dates, and its button becomes Completed today. Focus stays on it. The overdue counts fall. A fixed confirmation appears without a move of the list. It offers View completed today and Dismiss. In Due & overdue the row leaves, so focus moves to the View select.',
        { file: FILES.app, from: 'app.toast', to: 'app.toast' },
        ['jsx.next', 'jsx.status', 'jsx.ariaDisabled', 'jsx.overdueCount', 'app.toast', 'jsx.viewDone', 'jsx.dismiss', 'effect.focusAfterCompletion'],
        'Before → after', { last_completed: ['2025-11-03', '2026-11-08'], next_due: ['2026-11-03', '2027-11-08'], status: ['overdue', 'upcoming'], button: ['Mark done', 'Completed today'], portfolio_overdue: [6, 5], property_overdue: [1, 0], completed_today_count: [0, 1] }),
    ],
  },
}

const FUNCTIONS = [
  ['fn.loadMaintenance', FILES.loader, 'loadMaintenance', 'Parse both CSV files, validate every row, and return all data or every error.'],
  ['fn.todayLocal', FILES.dates, 'todayLocal', 'Read local year, month, and day. Return one zero-padded date string.'],
  ['fn.isCalendarDate', FILES.dates, 'isCalendarDate', 'Accept only a zero-padded YYYY-MM-DD value that names a real day.'],
  ['fn.addMonthsClamped', FILES.dates, 'addMonthsClamped', 'Add calendar months. Use the last valid day if the original day does not exist.'],
  ['fn.getStatus', FILES.dates, 'getStatus', 'Return overdue, due-today, or upcoming. Equality is not overdue.'],
  ['fn.completeItem', FILES.maintenance, 'completeItem', 'Return a new array with only the selected last_completed changed. Return the input for a same-day repeat or unknown ID.'],
  ['fn.toMaintenanceRow', FILES.maintenance, 'toMaintenanceRow', 'Derive next_due and status for one item.'],
  ['fn.buildPropertyGroups', FILES.maintenance, 'buildPropertyGroups', 'Join items to properties in source order. Derive rows and overdue counts.'],
  ['fn.matchesView', FILES.maintenance, 'matchesView', 'Due & overdue: next_due on or before today. Completed today: last_completed equals today. All tasks: every row.'],
  ['fn.countViews', FILES.maintenance, 'countViews', 'Count the rows in each view. The App passes the rows of the selected property.'],
  ['fn.filterGroupsByView', FILES.maintenance, 'filterGroupsByView', 'Keep matching rows in source order, recount overdue rows, and remove empty groups.'],
  ['fn.handleMarkDone', FILES.app, 'handleMarkDone', 'Capture the action date and set today. Ignore a task already completed on that date. Otherwise update items, show the confirmation, and request a focus check.'],
  ['fn.handleViewCompletedToday', FILES.app, 'handleViewCompletedToday', 'Select Completed today, keep the property filter, close the confirmation, and focus the View select.'],
  ['fn.handleDismiss', FILES.app, 'handleDismiss', 'Close the confirmation. Move focus to the View select if focus was inside it.'],
  ['fn.handleResetFilters', FILES.app, 'handleResetFilters', 'Reset both filters to show all tasks, then focus the View select.'],
  ['fn.refreshToday', FILES.app, 'refreshToday', 'Read the local date again when the window gets focus or the tab becomes visible.'],
]

// Handlers passed as JSX props have no call expression. Link the prop instead.
const EXTRA_CALLERS = {
  handleMarkDone: ['jsx.onMarkDone.app', 'jsx.onClick'],
  handleViewCompletedToday: ['jsx.viewDone'],
  handleDismiss: ['jsx.dismiss'],
  handleResetFilters: ['jsx.emptyState'],
}

const COMPONENTS = [
  ['fn.App', 'Page frame. Shows the data error panel or the calendar.'],
  ['fn.MaintenanceCalendar', 'Owns item, today, property filter, view, highlight, and confirmation state. Renders the empty state.'],
  ['fn.PropertySection', 'Property header, visible task and overdue counts, and task list.'],
  ['fn.MaintenanceRow', 'Dates, status badge, and the Mark done or Completed today button.'],
  ['fn.DataError', 'Visible error list. No task list appears with it.'],
]

const FIELD_TABLES = [
  ['Property', 'Fixed reference data from sample_properties.csv.', [
    ['property_id', 'string', 'Join key, for example P1.', ['field.Property.property_id', 'csv.properties.property_id', 'domain.join']],
    ['property_name', 'string', 'Display name, for example Maple Crossing.', ['field.Property.property_name', 'csv.properties.property_name', 'jsx.propertyName']],
    ['city', 'string', 'Property city.', ['field.Property.city', 'csv.properties.city', 'jsx.location']],
    ['state', 'string', 'Property state, for example SC.', ['field.Property.state', 'csv.properties.state', 'jsx.location']],
  ]],
  ['MaintenanceItem', 'React holds these records. Mark done changes only last_completed.', [
    ['item_id', 'string', 'Stable row key and completion target.', ['field.MaintenanceItem.item_id', 'csv.items.item_id', 'loader.duplicateItem', 'jsx.rowKey', 'domain.itemMatch']],
    ['property_id', 'string', 'Reference to Property.property_id.', ['field.MaintenanceItem.property_id', 'csv.items.property_id', 'loader.unknownProperty', 'domain.join']],
    ['task', 'string', 'Task name.', ['field.MaintenanceItem.task', 'csv.items.task', 'jsx.taskName']],
    ['category', 'string', 'Maintenance category.', ['field.MaintenanceItem.category', 'csv.items.category', 'jsx.category']],
    ['frequency_months', 'number', 'Positive safe integer after validation. The CSV value is text.', ['field.MaintenanceItem.frequency_months', 'csv.items.frequency_months', 'loader.frequency', 'loader.validFrequency', 'jsx.frequency']],
    ['last_completed', 'CalendarDate', 'The only mutable field.', ['field.MaintenanceItem.last_completed', 'csv.items.last_completed', 'loader.date', 'domain.stateWrite', 'jsx.last']],
  ]],
  ['MaintenanceRow and PropertyGroup', 'Derived objects for display. They are not separate mutable state.', [
    ['MaintenanceRow.next_due', 'CalendarDate', 'Calculated from last_completed and frequency_months.', ['field.MaintenanceRow.next_due', 'domain.nextDue', 'jsx.next']],
    ['MaintenanceRow.status', 'MaintenanceStatus', 'overdue, due-today, or upcoming.', ['field.MaintenanceRow.status', 'domain.status', 'jsx.status']],
    ['MaintenanceRow.completed_today', 'boolean', 'last_completed equals today. Drives the Completed today view and button.', ['field.MaintenanceRow.completed_today', 'domain.completedToday', 'domain.viewDone', 'row.actionText', 'jsx.ariaDisabled']],
    ['PropertyGroup.property', 'Property', 'The property record.', ['field.PropertyGroup.property', 'domain.groupProperty']],
    ['PropertyGroup.items', 'MaintenanceRow[]', 'All derived rows for this property.', ['field.PropertyGroup.items', 'domain.groupItems']],
    ['PropertyGroup.overdueCount', 'number', 'Overdue rows in this property. A view filter recounts the visible rows.', ['field.PropertyGroup.overdueCount', 'domain.overdueCount', 'fn.filterGroupsByView', 'jsx.overdueCount']],
  ]],
  ['Page UI state', 'MaintenanceCalendar state that controls the list and the confirmation. It never changes item data.', [
    ['propertyFilter', 'string', 'all or a property_id. Applies before the view counts.', ['state.propertyFilter', 'app.propertyGroups']],
    ['view', 'TaskView', 'all, due, or completed-today. Default all.', ['state.view', 'type.TaskView', 'jsx.viewSelect', 'app.visibleGroups']],
    ['lastCompletedId', 'string | null', 'Highlighted row after a completion.', ['state.lastCompletedId', 'jsx.PropertySection']],
    ['confirmationId', 'string | null', 'Task in the floating confirmation. Dismiss and View completed today clear it.', ['state.confirmationId', 'handler.setConfirmation', 'app.completed', 'app.toast']],
    ['focusCheckId', 'ref: string | null', 'Set by a completion. The effect focuses the View select if that row left the view.', ['state.focusCheckId', 'handler.focusCheck', 'effect.focusAfterCompletion']],
    ['viewCounts', 'ViewCounts', 'Derived counts for the View options.', ['app.viewCounts', 'type.ViewCounts', 'fn.countViews']],
  ]],
]

const ROLE_LABEL = {
  'type definition': 'type',
  'source CSV column': 'CSV column',
  'state write': 'state write',
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const lineId = (file, line) => `L:${file}:${line}`
const fileId = (file) => `F:${file}`

function link(ref, { showLabel = true, role = true } = {}) {
  const roleText = role ? `<span class="ref-role">${escapeHtml(ROLE_LABEL[ref.role] ?? ref.role)}</span>` : ''
  const label = showLabel ? `<span class="ref-label">${escapeHtml(ref.label)}</span>` : ''
  return `<a class="src-link" href="#${escapeHtml(lineId(ref.file, ref.line))}" data-file="${escapeHtml(ref.file)}" data-line="${ref.line}" data-start="${ref.start}" data-end="${ref.end}">${roleText}${label}<code class="ref-path">${escapeHtml(ref.file)}:${ref.line}</code></a>`
}

function excerptFor(refs, index, { file, from, to }) {
  const start = refs[from].start
  const end = Math.max(refs[to].end, start)
  const lines = index.lines(file)
  const last = Math.min(end, start + EXCERPT_LIMIT - 1)
  return {
    file,
    start,
    end,
    truncated: last < end,
    lines: lines.slice(start - 1, last).map((text, offset) => [start + offset, text]),
  }
}

function sourceViewer(index, files) {
  const tabs = files.map((file) => `<a class="file-tab" href="#${escapeHtml(fileId(file))}" data-file="${escapeHtml(file)}">${escapeHtml(file)}</a>`).join('')
  const listings = files.map((file) => {
    const lines = index.lines(file)
    if (lines.at(-1) === '') lines.pop()
    const body = lines.map((text, offset) => {
      const line = offset + 1
      return `<span class="line" id="${escapeHtml(lineId(file, line))}" data-line="${line}" tabindex="-1"><span class="no" aria-hidden="true">${line}</span><span class="text">${escapeHtml(text) || ' '}</span></span>`
    }).join('\n')
    return `<section class="source-file" id="${escapeHtml(fileId(file))}" data-file="${escapeHtml(file)}" aria-label="${escapeHtml(file)}"><header class="source-head"><code>${escapeHtml(file)}</code><span>${lines.length} lines</span></header><pre class="listing"><code>${body}</code></pre></section>`
  }).join('')
  return `<nav class="file-tabs" aria-label="Embedded source files">${tabs}</nav><div class="viewer-bar"><span id="viewer-target" class="viewer-target" aria-live="polite">Select a path:line link to open its source line.</span><button type="button" class="control" id="viewer-back" hidden>← Back to reference</button></div>${listings}`
}

export function buildWalkthrough(appRoot = APP_ROOT) {
  const { index, refs } = resolveReferences(appRoot)

  // Functions and their call sites, found by the AST across all app modules.
  const functionHtml = FUNCTIONS.map(([id, file, name, description]) => {
    const ref = refs[id]
    const signature = signatureOf(index, file, name)
    const calls = findCalls(index, TS_FILES, name).filter((call) => !(call.file === file && call.owner === name))
    const extra = (EXTRA_CALLERS[name] ?? []).map((refId) => refs[refId])
    const callLinks = [
      ...calls.map((call) => link({ file: call.file, line: call.line, start: call.line, end: call.line, label: `in ${call.owner}`, role: 'call site' })),
      ...extra.map((r) => link(r)),
    ]
    return `<article class="function" id="fn-${escapeHtml(name)}"><div><span class="mono file">${link(ref, { showLabel: false, role: false })}</span><h3><code>${escapeHtml(name)}()</code></h3></div><div><code class="signature">${escapeHtml(signature)}</code><p>${escapeHtml(description)}</p>${callLinks.length ? `<p class="calls"><span class="calls-label">Called from</span>${callLinks.join('')}</p>` : ''}</div></article>`
  }).join('')

  const componentHtml = COMPONENTS.map(([id, description]) => {
    const ref = refs[id]
    return `<tr><th scope="row"><code>${escapeHtml(ref.label)}</code></th><td>${escapeHtml(description)}</td><td>${link(ref, { showLabel: false, role: false })}</td></tr>`
  }).join('')

  const fieldHtml = FIELD_TABLES.map(([name, description, fields]) => {
    const rows = fields.map(([field, type, note, ids]) =>
      `<tr><th scope="row"><code>${escapeHtml(field)}</code></th><td><code>${escapeHtml(type)}</code></td><td>${escapeHtml(note)}</td><td class="where">${ids.map((id) => link(refs[id], { showLabel: false })).join('')}</td></tr>`).join('')
    return `<article class="schema"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(description)}</p><div class="table-scroll" tabindex="0" role="region" aria-label="${escapeHtml(name)} fields"><table><thead><tr><th>Field</th><th>Type</th><th>Role</th><th>Source location</th></tr></thead><tbody>${rows}</tbody></table></div></article>`
  }).join('')

  const typeLinks = ['type.CalendarDate', 'type.MaintenanceStatus', 'type.TaskView', 'type.ViewCounts', 'type.LoadResult'].map((id) => link(refs[id], { role: false })).join('')

  const flows = Object.fromEntries(Object.entries(FLOWS).map(([key, flow]) => [key, {
    ...flow,
    steps: flow.steps.map((value) => ({
      ...value,
      module: value.excerpt.file,
      excerpt: excerptFor(refs, index, value.excerpt),
      refs: value.refs.map((id) => {
        const ref = refs[id]
        if (!ref) throw new Error(`Unknown reference ${id}`)
        return { file: ref.file, line: ref.line, start: ref.start, end: ref.end, label: ref.label, role: ROLE_LABEL[ref.role] ?? ref.role }
      }),
    })),
  }]))

  const mapNode = (n, nodeKey, title, ref) =>
    `<div class="node${n === '01' ? ' active' : ''}" data-node="${nodeKey}"><span class="n">${n}</span><strong>${title}</strong>${link(ref, { showLabel: false, role: false })}</div>`

  const viewerFiles = Object.values(FILES)
  const fonts = [['Geist', 'geist-latin.woff2'], ['Geist Mono', 'geist-mono-latin.woff2']].map(([family, name]) => {
    const data = readFileSync(join(appRoot, 'src/assets/fonts', name)).toString('base64')
    return `@font-face{font-family:'${family}';font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');}`
  }).join('')

  const body = BODY
    .replace('__MAP__', [
      mapNode('01', 'assets', 'Bundled CSV text', refs['import.itemsCsv']),
      mapNode('02', 'loader', 'Read and validate', refs['fn.loadMaintenance']),
      mapNode('03', 'state', 'Items + today', refs['state.items']),
      mapNode('04', 'domain', 'Dates + groups', refs['fn.buildPropertyGroups']),
      mapNode('05', 'ui', 'Property sections', refs['fn.PropertySection']),
    ].join(''))
    .replace('__RETURN__', [refs['jsx.onClick'], refs['fn.handleMarkDone'], refs['fn.completeItem'], refs['fn.buildPropertyGroups']].map((r) => link(r, { role: false })).join('<span aria-hidden="true">→</span>'))
    .replace('__SCHEMAS__', fieldHtml)
    .replace('__TYPES__', typeLinks)
    .replace('__FUNCTIONS__', functionHtml)
    .replace('__COMPONENTS__', componentHtml)
    .replace('__RULE_CLAMP__', link(refs['domain.clamp'], { role: false }))
    .replace('__RULE_STATUS__', link(refs['domain.overdueCompare'], { role: false }))
    .replace('__RULE_PURE__', link(refs['domain.stateWrite']))
    .replace('__RULE_REFRESH__', link(refs['call.loadMaintenance']))
    .replace('__RULE_ERROR__', [refs['loader.result'], refs['app.sourceSwitch'], refs['fn.DataError']].map((r) => link(r)).join(''))
    .replace('__RULE_FOCUS__', link(refs['effect.refreshToday']))
    .replace('__RULE_VIEW__', [refs['domain.viewDue'], refs['domain.completedToday'], refs['domain.dropEmpty'], refs['app.viewCounts']].map((r) => link(r)).join(''))
    .replace('__RULE_KEEP_FOCUS__', [refs['jsx.ariaDisabled'], refs['handler.guard'], refs['effect.focusAfterCompletion']].map((r) => link(r)).join(''))
    .replace('__SOURCE__', sourceViewer(index, viewerFiles))
    .replace('__FILE_COUNT__', String(viewerFiles.length))
    .replace('__REF_COUNT__', String(Object.keys(refs).length))
    .replace('__LOGO__', `data:image/png;base64,${readFileSync(join(appRoot, 'src/assets/ziff-logo.png')).toString('base64')}`)

  const script = JS.replace('__FLOWS__', JSON.stringify(flows).replace(/</g, '\\u003c'))
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maintenance calendar | Developer walkthrough</title><style>${TOKENS}${fonts}${CSS}</style></head><body>${body}<script>${script}</script></body></html>\n`
  return { html, refs }
}

// ---------------------------------------------------------------------------
// Static template
// ---------------------------------------------------------------------------

// Ziff Real Estate Partners brand (https://www.ziffcre.com/). Navy carries text and actions;
// teal marks borders and highlights. Adobe Fonts are named first but not embedded; Geist is the offline fallback.
const TOKENS = `:root{--bg:#fff;--surface:#f5f6f9;--border:#e3e6ec;--border-strong:#747883;--ink:#223562;--muted:#5e5e5e;--accent:#65a6af;--accent-deep:#223562;--on-accent:#fff;--hit:#e4f0f2;--range:#f5f6f9;--font-body:'Sofia Pro',sofia-pro,'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;--font-head:'Aktiv Grotesk Extended',aktiv-grotesk-extended,'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'Geist Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;color-scheme:light}*,*::before,*::after{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-weight:300;line-height:1.6;-webkit-font-smoothing:antialiased}b,strong{font-weight:500}h1,h2,h3{margin:0;font-family:var(--font-head);font-weight:400;letter-spacing:.01em;line-height:1.2;text-wrap:balance}:focus-visible{outline:2px solid var(--accent-deep);outline-offset:3px}`

const CSS = `
html{scroll-behavior:smooth;scroll-padding-top:88px}body{font-size:16px}button{font:inherit;cursor:pointer}code,pre,.mono{font-family:var(--mono)}code{font-size:.83em}a{color:var(--accent-deep);text-underline-offset:4px}pre{margin:0;font-size:12px;line-height:1.8}h1{font-size:44px;max-width:860px;font-weight:300}h2{font-size:27px}h3{font-size:18px}.wrap{max-width:1280px;margin:auto;padding-inline:48px}.label{font-size:11px;font-weight:400;text-transform:uppercase;letter-spacing:.14em;color:var(--accent-deep);display:flex;align-items:center;gap:12px}.label::before{content:'';width:28px;height:2px;background:var(--accent)}.top{position:sticky;top:0;background:var(--bg);z-index:4;border-bottom:1px solid var(--border)}.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:72px}.identity{display:flex;align-items:center;gap:18px;min-width:0}.identity img{display:block;height:40px;width:auto}.identity-text{font-family:var(--font-head);font-size:14px;font-weight:400;padding-left:18px;border-left:1px solid var(--border);white-space:nowrap}.identity-text span{display:block;font-family:var(--font-body);font-size:10px;font-weight:300;letter-spacing:.14em;color:var(--muted)}.top nav{display:flex;gap:22px;flex-wrap:wrap}.top a{font-size:12px;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}.hero{padding-top:56px;padding-bottom:32px}.hero .label{margin:0 0 16px}.hero>p:last-child{max-width:780px;color:var(--muted);font-size:17px;margin:18px 0 0}.facts{display:flex;flex-wrap:wrap;gap:12px 28px;font-size:11px;text-transform:uppercase;letter-spacing:.1em;padding:18px 0 26px;border-bottom:1px solid var(--border);color:var(--muted)}.facts b{font-weight:500;color:var(--ink)}.section{padding-top:42px;padding-bottom:12px}.section-intro{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin-bottom:24px}.section-intro p{margin:0;color:var(--muted);font-size:13px;max-width:620px}
.src-link{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;min-height:32px;padding:4px 0;text-decoration:none;overflow-wrap:anywhere}.src-link:hover .ref-path,.src-link:focus-visible .ref-path{text-decoration:underline}.ref-path{font-size:11px;color:var(--accent-deep)}.ref-role{font:10px var(--mono);text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.ref-label{font-size:13px;color:var(--ink)}
.map-boundary{background:var(--surface);border:1px solid var(--border);border-top:2px solid var(--accent);border-radius:2px;padding:20px}.map-title{font:10px var(--mono);color:var(--muted);display:flex;justify-content:space-between;gap:16px;margin-bottom:18px}.map{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:22px}.node{position:relative;border:1px solid var(--border);background:var(--bg);border-radius:2px;padding:16px 13px;min-height:134px;display:flex;flex-direction:column;justify-content:space-between;transition:border-color 160ms}.node:not(:last-child)::after{content:'→';position:absolute;right:-18px;top:44px;color:var(--accent);font-size:18px}.node .n{font:10px var(--mono);color:var(--muted)}.node strong{font-size:14px;line-height:1.4;font-weight:550;margin:8px 0}.node .ref-path{font-size:10px}.node.active{border-color:var(--accent-deep);box-shadow:inset 0 0 0 1px var(--accent-deep)}.node.active .n{color:var(--accent-deep)}.return{margin-top:18px;font:11px/1.8 var(--mono);color:var(--accent-deep);display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 10px}.return .ref-label{font-size:11px}
.switches{display:flex;gap:8px;margin:28px 0 20px}.switch{min-height:44px;border:1px solid var(--border-strong);border-radius:2px;background:var(--bg);color:var(--muted);padding:0 18px;font-size:13px}.switch[aria-pressed=true]{background:var(--accent-deep);color:var(--on-accent);border-color:var(--accent-deep)}.flow-intro{margin-bottom:22px}.flow-intro h3{font-size:20px}.flow-intro p{margin:8px 0 0;font-size:14px;color:var(--muted)}.explorer{display:grid;grid-template-columns:260px minmax(0,1fr);border:1px solid var(--border);border-radius:2px;overflow:hidden}.steps{background:var(--surface);padding:14px;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:6px}.step{display:flex;gap:12px;text-align:left;align-items:center;min-height:56px;padding:10px 12px;border:1px solid transparent;border-radius:2px;background:transparent;color:var(--muted);font-size:12px}.step .num{font:11px var(--mono);min-width:18px}.step[aria-current=step]{border-color:var(--border-strong);background:var(--bg);color:var(--ink)}.step[aria-current=step] .num{color:var(--accent-deep)}.detail{padding:24px;min-width:0}.step-top{display:flex;justify-content:space-between;gap:14px;font:10px var(--mono);color:var(--muted);margin-bottom:13px}.detail h3{font-size:23px}.detail .signature{font:12px var(--mono);display:block;margin:12px 0;color:var(--accent-deep);overflow-wrap:anywhere}.detail p{font-size:14px;color:var(--muted);margin:12px 0 16px;max-width:700px}.step-refs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:2px 18px;margin:0 0 18px;padding:12px 14px;border:1px solid var(--border);border-radius:2px}.step-refs-title{grid-column:1/-1;font:10px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.payloads{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px}.codebox{border:1px solid var(--border);border-radius:2px;padding:16px;min-width:0;background:var(--surface)}.codebox .caption{font:10px/1.6 var(--mono);color:var(--muted);margin-bottom:13px;overflow-wrap:anywhere}.codebox pre{white-space:pre-wrap;overflow-wrap:anywhere}.excerpt{overflow-x:auto}.excerpt pre{white-space:pre}.excerpt .no{display:inline-block;min-width:3ch;margin-right:14px;text-align:right;color:var(--muted);user-select:none}.controls{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:22px}.controls .count{font:11px var(--mono);color:var(--muted)}.buttons{display:flex;gap:8px}.control{min-height:44px;min-width:88px;padding:0 16px;border:1px solid var(--border-strong);border-radius:2px;background:var(--bg);color:var(--ink);font-size:13px}.control.primary{background:var(--accent-deep);color:var(--on-accent);border-color:var(--accent-deep)}button:disabled{cursor:default;color:var(--muted);background:var(--surface);border-color:var(--border)}.footnote{font-size:12px;color:var(--muted);margin:14px 0 0}
.schema{border:1px solid var(--border);border-top:2px solid var(--accent);border-radius:2px;padding:24px;margin-bottom:16px}.schema>p{font-size:13px;color:var(--muted);margin:8px 0 20px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}thead th{font:10px var(--mono);text-transform:uppercase;color:var(--muted);padding:0 16px 12px 0}tbody th,tbody td{border-top:1px solid var(--border);padding:13px 16px 13px 0;vertical-align:top}tbody th{font-weight:400;width:20%}tbody td:nth-child(2){width:15%;color:var(--accent-deep)}tbody td:nth-child(3){color:var(--muted);width:28%}td.where{display:flex;flex-direction:column;gap:0}.components td:nth-child(2){width:auto;color:var(--muted)}
.function{display:grid;grid-template-columns:300px minmax(0,1fr);gap:24px;padding:24px 0;border-top:1px solid var(--border)}.function h3{margin-top:4px}.function .signature{font-size:11px;overflow-wrap:anywhere;line-height:1.8}.function p{font-size:13px;color:var(--muted);margin:8px 0 0}.calls{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 18px}.calls-label{font:10px var(--mono);text-transform:uppercase;letter-spacing:.04em;width:100%}.components{margin-top:12px}
.rule-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rule{border:1px solid var(--border);border-radius:2px;padding:22px}.rule h3{font-size:16px}.rule p{font-size:13px;color:var(--muted);margin:8px 0 0}.rule code.example{font-size:11px;color:var(--accent-deep);display:block;margin-top:12px}.error-note{border-left:3px solid var(--ink);padding:4px 0 4px 16px;margin:22px 0}.error-note p{font-size:13px;color:var(--muted);margin:6px 0}
.viewer{border:1px solid var(--border);border-radius:2px;overflow:hidden}.file-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:10px;background:var(--surface);border-bottom:1px solid var(--border)}.file-tab{font:11px var(--mono);min-height:36px;display:inline-flex;align-items:center;padding:0 10px;border:1px solid transparent;border-radius:2px;text-decoration:none;color:var(--muted)}.file-tab[aria-current=true]{border-color:var(--border-strong);background:var(--bg);color:var(--ink)}.viewer-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);font:11px var(--mono);color:var(--muted);flex-wrap:wrap}.viewer-target{overflow-wrap:anywhere}.source-head{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;font:11px var(--mono);color:var(--muted);border-bottom:1px solid var(--border)}.listing{overflow:auto;max-height:70vh;padding:8px 0;font-size:12px;line-height:1.7}.line{display:block;padding-right:16px;white-space:pre;scroll-margin:40vh 0}.line .no{display:inline-block;min-width:4.5ch;padding-right:14px;margin-right:12px;text-align:right;color:var(--muted);border-right:1px solid var(--border);user-select:none}.line.in-range{background:var(--range)}:root:not(.js) .line:target,.line.hit{background:var(--hit);box-shadow:inset 3px 0 0 var(--accent-deep)}:root:not(.js) .line:target .no,.line.hit .no{color:var(--accent-deep);font-weight:600}.line:focus{outline:none}.line:focus-visible{outline:2px solid var(--accent-deep);outline-offset:-2px}.js .source-file:not(.active){display:none}.source-file+.source-file{border-top:1px solid var(--border)}
footer{padding:32px 0 48px;border-top:1px solid var(--border);margin-top:32px;font-size:12px;color:var(--muted)}footer p{margin:8px 0}.scope{font:10px var(--mono);text-transform:uppercase;letter-spacing:.04em}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.noscript{border:1px solid var(--border-strong);padding:16px;margin:16px 0;font-size:14px}.noscript p{margin:8px 0}
@media(hover:hover) and (pointer:fine){button:not(:disabled):hover{border-color:var(--accent-deep)}.top a:hover{text-decoration:underline}}
@media(max-width:1000px){.wrap{padding-inline:28px}.explorer{grid-template-columns:210px minmax(0,1fr)}.payloads{grid-template-columns:1fr}.node{padding:12px 10px}.map{gap:17px}.node:not(:last-child)::after{right:-15px}.function{grid-template-columns:230px minmax(0,1fr)}}
@media(max-width:700px){.wrap{padding-inline:16px}.top{position:static}.top .wrap{min-height:64px;flex-wrap:wrap;gap:0;padding-block:8px}.identity{gap:12px}.identity img{height:32px}.identity-text{font-size:13px;padding-left:12px}.identity-text span{font-size:9px}.top nav{gap:16px}.top a{font-size:11px}.hero{padding-top:32px}h1{font-size:32px;letter-spacing:-.8px}.hero>p:last-child{font-size:16px}.facts{gap:10px 16px;font-size:10px}.section{padding-top:30px}.section-intro{display:block}.section-intro p{margin-top:10px}h2{font-size:24px}.map-title{display:block;font-size:9px}.map-title span{display:block;margin-top:5px}.map{grid-template-columns:1fr;gap:20px}.node{min-height:80px;padding:14px 16px;display:grid;grid-template-columns:24px minmax(0,1fr);gap:4px 12px}.node .n{grid-row:1/3;padding-top:4px}.node strong{margin:0}.node .src-link{grid-column:2}.node:not(:last-child)::after{content:'↓';right:auto;left:28px;top:auto;bottom:-22px}.return{justify-content:flex-start;font-size:10px}.switches{display:grid;grid-template-columns:1fr 1fr;gap:8px}.switch{padding:10px;font-size:12px}.explorer{display:block}.steps{border-right:0;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;padding:10px;gap:4px}.step{font-size:11px;min-height:58px;padding:8px;gap:6px}.step .num{font-size:10px;min-width:16px}.detail{padding:16px}.detail h3{font-size:21px}.step-top{display:block;font-size:9px;overflow-wrap:anywhere}.step-top span{display:block;margin-top:5px}.detail p{font-size:15px}.detail .signature{font-size:11px}.step-refs{grid-template-columns:minmax(0,1fr)}.codebox{padding:12px}pre{font-size:11px}.controls{gap:8px}.control{min-width:70px;padding:0 12px}.controls .count{font-size:10px}.schema{padding:16px}table{min-width:620px}.function{display:block;padding:20px 0}.function>div:last-child{margin-top:12px}.rule-grid{grid-template-columns:1fr}.rule p{font-size:14px}.listing{font-size:11px;max-height:60vh}footer{line-height:1.8}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.node{transition:none}}
@media print{.top{position:static}.steps,.controls,.switches,.viewer-bar,.file-tabs{display:none}.explorer{display:block}.js .source-file:not(.active){display:block}.listing{max-height:none}.wrap{padding-inline:0}.schema,.function,.rule{break-inside:avoid}a{color:var(--ink)}}
`

const BODY = `
<header class="top"><div class="wrap"><div class="identity"><img src="__LOGO__" width="231" height="74" alt="Ziff Real Estate Partners"><span class="identity-text">Maintenance calendar <span>DEVELOPER WALKTHROUGH</span></span></div><nav aria-label="Document sections"><a href="#flow">Flow</a><a href="#fields">Fields</a><a href="#functions">Functions</a><a href="#rules">Rules</a><a href="#source">Source</a></nav></div></header>
<main class="wrap">
<header class="hero"><p class="label">Implemented app / source-linked walkthrough</p><h1>From a CSV row to<br>a Mark done click.</h1><p>The React app now exists. Every <code>path:line</code> link below comes from the actual source files and opens the embedded source viewer at that line. The step snapshots stay explanatory examples, fixed to November 8, 2026.</p></header>
<div class="facts"><span><b>Runtime</b> Browser</span><span><b>Input</b> 2 CSV files</span><span><b>State</b> React memory</span><span><b>Server API</b> None</span><span><b>Database</b> None</span><span><b>Embedded files</b> __FILE_COUNT__</span><span><b>Verified references</b> __REF_COUNT__</span></div>
<section class="section" id="flow" aria-labelledby="flow-heading"><div class="section-intro"><h2 id="flow-heading">Follow the data</h2><p>Select a path, then use Next or choose a step. Each step lists its real source locations and shows an excerpt of the current code.</p></div>
<div class="map-boundary"><div class="map-title">MODULE MAP <span>The app logic runs inside the user’s browser.</span></div><div class="map" aria-label="Architecture overview">__MAP__</div><div class="return"><span>Mark done:</span>__RETURN__<span aria-hidden="true">→</span><span>derived rows → UI</span></div></div>
<div class="switches" role="group" aria-label="Choose a walkthrough"><button type="button" class="switch" data-mode="load" aria-pressed="true">01 / Read CSV files</button><button type="button" class="switch" data-mode="click" aria-pressed="false">02 / Click Mark done</button></div>
<div class="flow-intro"><h3 id="flow-title"></h3><p id="flow-description"></p></div>
<div class="explorer"><nav class="steps" id="step-list" aria-label="Walkthrough steps"></nav><article class="detail" aria-labelledby="step-title"><div class="step-top"><span id="step-position"></span><span id="step-module"></span></div><h3 id="step-title" tabindex="-1"></h3><code class="signature" id="step-function"></code><p id="step-description"></p><div class="step-refs" id="step-refs"></div><div class="payloads"><div class="codebox excerpt"><div class="caption" id="excerpt-caption"></div><pre><code id="step-code"></code></pre></div><div class="codebox"><div class="caption" id="snapshot-title"></div><pre><code id="step-snapshot"></code></pre></div></div><div class="controls"><span class="count" id="step-count"></span><div class="buttons"><button type="button" class="control" id="previous">Back</button><button type="button" class="control primary" id="next">Next →</button></div></div></article></div>
<p class="sr-only" role="status" id="announcement"></p><p class="footnote">The code excerpts are current source lines. The data snapshots are predefined examples for November 8, 2026. These controls do not run the React app or change the CSV files.</p>
<noscript><div class="noscript"><strong>JavaScript is off. The fields, functions, and source files below remain available, and every path:line link still jumps to its line.</strong><p>Read CSV text → loadMaintenance → App state → buildPropertyGroups → property sections.</p><p>Click → handleMarkDone → todayLocal → completeItem → new state → derived dates, status, and view counts → updated row, Completed today button, and floating confirmation.</p></div></noscript>
</section>
<section class="section" id="fields" aria-labelledby="fields-heading"><div class="section-intro"><h2 id="fields-heading">Fields and relationships</h2><p>Each field links to its type definition, its source CSV column, and the code that validates, joins, writes, or renders it.</p></div>__SCHEMAS__<p class="footnote">Related types: __TYPES__</p></section>
<section class="section" id="functions" aria-labelledby="functions-heading"><div class="section-intro"><h2 id="functions-heading">The function contract</h2><p>Signatures come from the source. Call sites come from a search of the TypeScript syntax tree.</p></div>__FUNCTIONS__
<h3 id="components-heading" class="components-title">Components</h3><div class="table-scroll components" tabindex="0" role="region" aria-labelledby="components-heading"><table class="components"><thead><tr><th>Component</th><th>Role</th><th>Source location</th></tr></thead><tbody>__COMPONENTS__</tbody></table></div></section>
<section class="section" id="rules" aria-labelledby="rules-heading"><div class="section-intro"><h2 id="rules-heading">Rules that keep the flow correct</h2><p>The main risk is date arithmetic, not infrastructure.</p></div><div class="rule-grid">
<article class="rule"><h3>Clamp the day to the target month</h3><p>Months have different lengths. Use the final day of the target month when the original day does not exist.</p><code class="example">2026-10-31 + 1 month = 2026-11-30<br>2024-01-31 + 1 month = 2024-02-29</code>__RULE_CLAMP__</article>
<article class="rule"><h3>Due today is not overdue</h3><p>Compare validated, zero-padded date strings. Use one shared local date for the action and status checks.</p><code class="example">next_due &lt; today → overdue<br>next_due === today → due-today<br>next_due &gt; today → upcoming</code>__RULE_STATUS__</article>
<article class="rule"><h3>Keep the update pure</h3><p>Only last_completed changes. Due dates, statuses, and counts derive from the current item array. A same-day repeat changes nothing.</p><code class="example">same item + same completion date<br>→ same next due date</code>__RULE_PURE__</article>
<article class="rule"><h3>Refresh restores the source data</h3><p>The brief permits memory-only changes. The click does not write a CSV, localStorage, an API, or a database.</p><code class="example">Page refresh → original bundled CSV values</code>__RULE_REFRESH__</article>
<article class="rule"><h3>Views filter derived rows</h3><p>Due &amp; overdue includes due today. Completed today is not permanent: the task still has a next due date. Counts use the selected property before the view filter. Portfolio totals stay portfolio-wide.</p><code class="example">due → next_due &lt;= today<br>completed-today → last_completed === today</code>__RULE_VIEW__</article>
<article class="rule"><h3>Keep focus on a stable control</h3><p>A completed button keeps focus through aria-disabled, and the handler ignores it. When the row leaves the view, or the confirmation closes, focus moves to the View select.</p><code class="example">All tasks → focus stays on the row button<br>Due &amp; overdue → focus moves to View</code>__RULE_KEEP_FOCUS__</article>
</div><aside class="error-note"><strong>Invalid input stops the task list.</strong><p>The loader rejects invalid dates, frequencies, duplicate IDs, missing fields, and unknown property references.</p><p>It returns <code>{ ok: false, errors: string[] }</code>. App shows the error panel instead of an incomplete list.</p><p>__RULE_ERROR__</p></aside><p class="footnote">The app reads today again on window focus, on a return to a visible tab, and on each completion. It does not run a background timer at midnight. After midnight, a refresh empties Completed today and brings back Mark done. __RULE_FOCUS__</p></section>
<section class="section" id="source" aria-labelledby="source-heading"><div class="section-intro"><h2 id="source-heading">Embedded source</h2><p>These are the app files that the links reference, copied at generation time. Paths are relative to the app root. A highlighted band marks the full declaration; the darker line is the target.</p></div><div class="viewer">__SOURCE__</div></section>
</main><footer><div class="wrap"><p class="scope">Generated by scripts/generate-walkthrough.mjs from the app source</p><p>Run <code>npm run docs</code> after a source change. <code>npm run build</code> runs it automatically, and <code>npm run docs:check</code> fails when this file is out of date.</p><p>Visual brand: Ziff Real Estate Partners. The site’s Adobe Fonts are named first but not embedded; bundled Geist fonts keep this file correct offline.</p></div></footer>
`

const JS = `
document.documentElement.classList.add('js');
const flows = __FLOWS__;
let mode = 'load';
let index = 0;
let origin = null;
const byId = (id) => document.getElementById(id);
function refLink(ref) {
  const a = document.createElement('a');
  a.className = 'src-link';
  a.href = '#L:' + ref.file + ':' + ref.line;
  a.dataset.file = ref.file; a.dataset.line = ref.line; a.dataset.start = ref.start; a.dataset.end = ref.end;
  const role = document.createElement('span'); role.className = 'ref-role'; role.textContent = ref.role;
  const label = document.createElement('span'); label.className = 'ref-label'; label.textContent = ref.label;
  const path = document.createElement('code'); path.className = 'ref-path'; path.textContent = ref.file + ':' + ref.line;
  a.append(role, label, path);
  return a;
}
function render(moveFocus = false) {
  const flow = flows[mode];
  const step = flow.steps[index];
  document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  document.querySelectorAll('[data-node]').forEach((node) => node.classList.toggle('active', node.dataset.node === step.node));
  byId('flow-title').textContent = flow.title;
  byId('flow-description').textContent = flow.intro;
  byId('step-list').replaceChildren(...flow.steps.map((value, number) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'step';
    button.setAttribute('aria-label', 'Step ' + (number + 1) + ': ' + value.title);
    if (number === index) button.setAttribute('aria-current', 'step');
    const numeral = document.createElement('span'); numeral.className = 'num'; numeral.textContent = String(number + 1).padStart(2, '0');
    const label = document.createElement('span'); label.textContent = value.title;
    button.append(numeral, label);
    button.addEventListener('click', () => { index = number; render(true); });
    return button;
  }));
  byId('step-position').textContent = (mode === 'load' ? 'CSV READ' : 'BUTTON CLICK') + ' / STEP ' + (index + 1);
  byId('step-module').textContent = step.module;
  byId('step-title').textContent = step.title;
  byId('step-function').textContent = step.function;
  byId('step-description').textContent = step.description;
  const title = document.createElement('span'); title.className = 'step-refs-title'; title.textContent = 'Source locations in this step';
  byId('step-refs').replaceChildren(title, ...step.refs.map(refLink));
  const ex = step.excerpt;
  byId('excerpt-caption').replaceChildren('CURRENT SOURCE / ', refLink({ file: ex.file, line: ex.start, start: ex.start, end: ex.end, role: '', label: 'lines ' + ex.start + '–' + ex.end }));
  const code = byId('step-code');
  code.replaceChildren(...ex.lines.map(([number, text]) => {
    const line = document.createElement('span');
    const no = document.createElement('span'); no.className = 'no'; no.textContent = number; no.setAttribute('aria-hidden', 'true');
    line.append(no, text + '\\n');
    return line;
  }));
  if (ex.truncated) code.append('… excerpt continues in the source viewer\\n');
  byId('snapshot-title').textContent = 'EXAMPLE DATA / ' + step.snapshotTitle;
  byId('step-snapshot').textContent = JSON.stringify(step.snapshot, null, 2);
  byId('step-count').textContent = (index + 1) + ' of ' + flow.steps.length;
  byId('previous').disabled = index === 0;
  byId('next').disabled = index === flow.steps.length - 1;
  byId('announcement').textContent = flow.title + '. Step ' + (index + 1) + ' of ' + flow.steps.length + ': ' + step.title + '.';
  if (moveFocus) byId('step-title').focus({ preventScroll: true });
}
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { mode = button.dataset.mode; index = 0; render(); }));
byId('previous').addEventListener('click', () => { if (index > 0) { index--; render(true); } });
byId('next').addEventListener('click', () => { if (index < flows[mode].steps.length - 1) { index++; render(true); } });

// Source viewer: show one file, highlight the declaration range and target line.
let range = null;
function showFile(file) {
  document.querySelectorAll('.source-file').forEach((section) => section.classList.toggle('active', section.dataset.file === file));
  document.querySelectorAll('.file-tab').forEach((tab) => tab.setAttribute('aria-current', String(tab.dataset.file === file)));
}
function clearMarks() {
  document.querySelectorAll('.line.hit, .line.in-range').forEach((line) => line.classList.remove('hit', 'in-range'));
}
function openTarget(hash, focusLine) {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const match = /^([LF]):(.+?)(?::(\\d+))?$/.exec(id);
  if (!match) return;
  const file = match[2];
  if (!document.querySelector('.source-file[data-file="' + CSS.escape(file) + '"]')) return;
  showFile(file);
  clearMarks();
  if (match[1] === 'F') {
    byId('viewer-target').textContent = file;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    return;
  }
  const line = Number(match[3]);
  const target = document.getElementById(id);
  if (!target) return;
  const start = range && range.file === file && range.line === line ? range.start : line;
  const end = range && range.file === file && range.line === line ? range.end : line;
  for (let n = start; n <= end; n++) document.getElementById('L:' + file + ':' + n)?.classList.add('in-range');
  target.classList.add('hit');
  byId('viewer-target').textContent = 'Showing ' + file + ':' + line + (end > start ? ' (lines ' + start + '–' + end + ')' : '') + ' · ' + target.textContent.replace(/^\\s*\\d+/, '').trim();
  byId('viewer-back').hidden = !origin;
  target.scrollIntoView({ block: 'center' });
  if (focusLine) target.focus({ preventScroll: true });
}
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a.src-link, a.file-tab');
  if (!anchor) return;
  if (anchor.classList.contains('src-link')) {
    origin = anchor.closest('.source-file') ? origin : anchor;
    range = { file: anchor.dataset.file, line: Number(anchor.dataset.line), start: Number(anchor.dataset.start), end: Number(anchor.dataset.end) };
  }
  // Open the line now. pushState keeps Back working without waiting for hashchange.
  const hash = anchor.getAttribute('href');
  event.preventDefault();
  if (location.hash !== hash) history.pushState(null, '', hash);
  openTarget(hash, true);
});
window.addEventListener('hashchange', () => openTarget(location.hash, true));
window.addEventListener('popstate', () => openTarget(location.hash, true));
byId('viewer-back').addEventListener('click', () => {
  if (!origin || !origin.isConnected) { byId('viewer-back').hidden = true; return; }
  origin.scrollIntoView({ block: 'center' });
  origin.focus();
});
render();
showFile(document.querySelector('.source-file').dataset.file);
if (location.hash) openTarget(location.hash, false);
`

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const check = process.argv.includes('--check')
  const { html, refs } = buildWalkthrough()
  const target = join(APP_ROOT, OUTPUT)
  if (check) {
    let current = ''
    try {
      current = readFileSync(target, 'utf8')
    } catch {
      // Missing output counts as out of date.
    }
    if (current !== html) {
      console.error(`${OUTPUT} is out of date. Run npm run docs.`)
      process.exit(1)
    }
    console.log(`${OUTPUT} is current (${Object.keys(refs).length} verified references).`)
    return
  }
  writeFileSync(target, html)
  console.log(`Wrote ${OUTPUT} (${Object.keys(refs).length} verified references, ${Math.round(html.length / 1024)} KB).`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`Walkthrough generation failed: ${error.message}`)
    process.exit(1)
  }
}
