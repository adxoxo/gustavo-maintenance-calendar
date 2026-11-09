import { useEffect, useMemo, useRef, useState } from 'react'
import ziffLogo from './assets/ziff-logo.png'
import { DataError } from './components/DataError'
import { PropertySection } from './components/PropertySection'
import { sourceData } from './data/source'
import { formatCalendarDate, formatLongDate, todayLocal } from './domain/dates'
import { buildPropertyGroups, completeItem, countViews, filterGroupsByView } from './domain/maintenance'
import type { LoadResult, MaintenanceData, TaskView } from './domain/types'

const ALL_PROPERTIES = 'all'

const VIEW_OPTIONS: [TaskView, string][] = [
  ['all', 'All tasks'],
  ['due', 'Due & overdue'],
  ['completed-today', 'Completed today'],
]

const EMPTY_MESSAGE: Record<TaskView, string> = {
  all: 'No tasks match these filters.',
  due: 'No tasks are due or overdue for this selection.',
  'completed-today':
    'No tasks were completed today for this selection. Mark a task done, then return here. Changes reset on refresh.',
}

interface AppProps {
  /** Tests pass an invalid result here. The page normally uses the bundled CSVs. */
  source?: LoadResult
}

export default function App({ source = sourceData }: AppProps) {
  return (
    <div className="shell">
      <header className="topbar">
        <img className="logo" src={ziffLogo} width={231} height={74} alt="Ziff Real Estate Partners" />
        <p className="wordmark">
          Maintenance calendar<span>Property operations</span>
        </p>
      </header>
      {source.ok ? <MaintenanceCalendar data={source.data} /> : <DataError errors={source.errors} />}
      <footer className="footer">
        <span>Mark done starts the next maintenance cycle. Changes reset on refresh.</span>
      </footer>
    </div>
  )
}

function MaintenanceCalendar({ data }: { data: MaintenanceData }) {
  const properties = data.properties
  const [items, setItems] = useState(data.items)
  const [today, setToday] = useState(() => todayLocal())
  const [propertyFilter, setPropertyFilter] = useState(ALL_PROPERTIES)
  const [view, setView] = useState<TaskView>('all')
  const [lastCompletedId, setLastCompletedId] = useState<string | null>(null)
  const [confirmationId, setConfirmationId] = useState<string | null>(null)
  const viewSelect = useRef<HTMLSelectElement>(null)
  const statusRegion = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLElement>(null)
  // The item ID of a completion that can remove its row from the current view.
  const focusCheckId = useRef<string | null>(null)

  // Keep "today" current when the user returns to the tab or window.
  useEffect(() => {
    function refreshToday() {
      if (document.visibilityState === 'visible') setToday(todayLocal())
    }
    window.addEventListener('focus', refreshToday)
    document.addEventListener('visibilitychange', refreshToday)
    return () => {
      window.removeEventListener('focus', refreshToday)
      document.removeEventListener('visibilitychange', refreshToday)
    }
  }, [])

  function handleMarkDone(itemId: string) {
    const actionDate = todayLocal()
    setToday(actionDate)
    // A Completed today button (aria-disabled) and a same-day repeat both stop here. The guard uses
    // the fresh date, so a click after midnight completes the task even if the display date is stale.
    const item = items.find((candidate) => candidate.item_id === itemId)
    if (!item || item.last_completed === actionDate) return
    setItems((previous) => completeItem(previous, itemId, actionDate))
    setLastCompletedId(itemId)
    setConfirmationId(itemId)
    focusCheckId.current = itemId
  }

  function focusViewSelect() {
    viewSelect.current?.focus()
  }

  function handleViewCompletedToday() {
    setView('completed-today')
    setConfirmationId(null)
    focusViewSelect()
  }

  function handleDismiss() {
    const active = document.activeElement
    const itemId = confirmationId
    setConfirmationId(null)
    // The dismiss button leaves the page. Move focus only if it was inside the confirmation.
    if (active && active !== document.body && !statusRegion.current?.contains(active)) return
    // Return to the completed row's button if it is still shown, else the View select. Keep the scroll position.
    // Compare dataset values, not a built selector: a valid CSV item_id can contain quotes or brackets.
    const rows = content.current ? [...content.current.querySelectorAll<HTMLElement>('[data-item-id]')] : []
    const rowButton = rows.find((row) => row.dataset.itemId === itemId)?.querySelector<HTMLElement>('button.done')
    const target = rowButton ?? viewSelect.current
    target?.focus({ preventScroll: true })
  }

  function handleResetFilters() {
    setPropertyFilter(ALL_PROPERTIES)
    setView('all')
    focusViewSelect()
  }

  const groups = useMemo(() => buildPropertyGroups(properties, items, today), [properties, items, today])
  const overdueTotal = groups.reduce((total, group) => total + group.overdueCount, 0)
  const propertyGroups =
    propertyFilter === ALL_PROPERTIES
      ? groups
      : groups.filter((group) => group.property.property_id === propertyFilter)
  const viewCounts = countViews(propertyGroups.flatMap((group) => group.items))
  const visibleGroups = filterGroupsByView(propertyGroups, view)

  const completed = groups
    .flatMap((group) => group.items.map((row) => ({ row, property: group.property })))
    .find(({ row }) => row.item_id === confirmationId)

  // After a completion, the row can leave the current view (Due & overdue). Its button
  // then no longer exists, so move focus to the View select.
  useEffect(() => {
    const itemId = focusCheckId.current
    if (itemId === null) return
    focusCheckId.current = null
    const stillVisible = visibleGroups.some((group) => group.items.some((row) => row.item_id === itemId))
    if (!stillVisible) focusViewSelect()
  })

  return (
    <main className="content" ref={content}>
      <header className="intro">
        <div>
          <p className="eyebrow">Property care, on schedule</p>
          <h1>Preventative maintenance</h1>
          <p className="subtitle">See what is due. Keep each property on track.</p>
        </div>
        <p className="today">
          <span>As of today</span>
          <strong>
            <time dateTime={today}>{formatLongDate(today)}</time>
          </strong>
        </p>
      </header>

      <div className="toolbar">
        <section className="totals" aria-label="Portfolio summary">
          <p className="metric">
            <b>{properties.length}</b> properties
          </p>
          <p className="metric">
            <b>{items.length}</b> tasks
          </p>
          <p className="metric" data-testid="overdue-total">
            <b>{overdueTotal}</b> overdue
          </p>
        </section>
        <div className="filters">
          <div className="filter">
            <label htmlFor="property-filter">Property</label>
            <select
              id="property-filter"
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
            >
              <option value={ALL_PROPERTIES}>All properties</option>
              {properties.map((property) => (
                <option key={property.property_id} value={property.property_id}>
                  {property.property_name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter">
            <label htmlFor="view-filter">View</label>
            <select
              id="view-filter"
              ref={viewSelect}
              value={view}
              onChange={(event) => setView(event.target.value as TaskView)}
            >
              {VIEW_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({viewCounts[value]})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Fixed to the viewport, so a message never moves the task list. */}
      <div role="status" className="status-region" ref={statusRegion}>
        {completed && (
          <div className="toast">
            <svg className="toast-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="toast-copy">
              <p>
                <b>
                  {completed.row.task} at {completed.property.property_name} marked done on{' '}
                  {formatCalendarDate(completed.row.last_completed)}.
                </b>
                <small>Next due {formatCalendarDate(completed.row.next_due)}.</small>
              </p>
              {completed.row.completed_today && (
                <button type="button" className="view-done" onClick={handleViewCompletedToday}>
                  View completed today
                </button>
              )}
            </div>
            <button type="button" className="dismiss" aria-label="Dismiss confirmation" onClick={handleDismiss}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <section className="no-results" aria-labelledby="no-results-title">
          <h2 id="no-results-title">No tasks to show</h2>
          <p>{EMPTY_MESSAGE[view]}</p>
          <button type="button" className="reset" onClick={handleResetFilters}>
            Show all tasks
          </button>
        </section>
      ) : (
        visibleGroups.map((group) => (
          <PropertySection
            key={group.property.property_id}
            group={group}
            position={properties.indexOf(group.property) + 1}
            highlightedId={lastCompletedId}
            onMarkDone={handleMarkDone}
          />
        ))
      )}
    </main>
  )
}
