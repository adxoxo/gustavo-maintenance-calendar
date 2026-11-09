import { formatCalendarDate } from '../domain/dates'
import type { MaintenanceStatus, MaintenanceRow as MaintenanceRowData } from '../domain/types'

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  overdue: 'Overdue',
  'due-today': 'Due today',
  upcoming: 'Upcoming',
}

interface MaintenanceRowProps {
  row: MaintenanceRowData
  propertyName: string
  highlighted: boolean
  onMarkDone: (itemId: string) => void
}

function frequencyText(months: number): string {
  return months === 1 ? 'Every month' : `Every ${months} months`
}

export function MaintenanceRow({ row, propertyName, highlighted, onMarkDone }: MaintenanceRowProps) {
  const actionText = row.completed_today ? 'Completed today' : 'Mark done'
  return (
    <li className={highlighted ? 'row updated' : 'row'} data-item-id={row.item_id}>
      <div className="task">
        <p className="task-name">{row.task}</p>
        <p className="category">
          <span className="sr-only">Category: </span>
          {row.category}
        </p>
      </div>
      <p className="datum frequency">
        <span className="date-label">Repeat</span>
        {frequencyText(row.frequency_months)}
      </p>
      <p className="datum last">
        <span className="date-label">Last completed</span>
        <time dateTime={row.last_completed}>{formatCalendarDate(row.last_completed)}</time>
      </p>
      <p className="datum next">
        <span className="date-label">Next due</span>
        <time dateTime={row.next_due}>{formatCalendarDate(row.next_due)}</time>
      </p>
      <p className="status">
        <span className="sr-only">Status: </span>
        <span className={`badge ${row.status}`}>
          {row.status === 'overdue' && (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          {STATUS_LABEL[row.status]}
        </span>
      </p>
      {/*
        The name starts with the visible text and adds task and property, so every button is distinct.
        A row completed today uses aria-disabled, not disabled, so keyboard focus stays on the button.
        The App handler ignores a click on it.
      */}
      <button
        type="button"
        className="done"
        aria-label={`${actionText}: ${row.task} at ${propertyName}`}
        aria-disabled={row.completed_today ? 'true' : undefined}
        onClick={() => onMarkDone(row.item_id)}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {actionText}
      </button>
    </li>
  )
}
