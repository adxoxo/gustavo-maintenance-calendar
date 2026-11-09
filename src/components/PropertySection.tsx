import type { PropertyGroup } from '../domain/types'
import { MaintenanceRow } from './MaintenanceRow'

interface PropertySectionProps {
  group: PropertyGroup
  position: number
  highlightedId: string | null
  onMarkDone: (itemId: string) => void
}

export function PropertySection({ group, position, highlightedId, onMarkDone }: PropertySectionProps) {
  const { property, items, overdueCount } = group
  const headingId = `property-${property.property_id}`
  return (
    <section className="property" aria-labelledby={headingId}>
      <header className="property-head">
        <div className="property-title">
          <span className="property-index" aria-hidden="true">
            {String(position).padStart(2, '0')}
          </span>
          <div>
            <h2 id={headingId}>{property.property_name}</h2>
            <p className="location">
              {property.city}, {property.state}
            </p>
          </div>
        </div>
        <p className="property-note">
          <span className="count">
            {items.length} {items.length === 1 ? 'task' : 'tasks'}
          </span>
          <span className="separator" aria-hidden="true">
            {' · '}
          </span>
          <strong data-testid={`overdue-${property.property_id}`}>{overdueCount} overdue</strong>
        </p>
      </header>
      {items.length === 0 ? (
        <p className="empty">No maintenance tasks for this property.</p>
      ) : (
        <>
          <div className="row columns" aria-hidden="true">
            <span>Maintenance task</span>
            <span>Frequency</span>
            <span>Last completed</span>
            <span>Next due</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          <ul className="rows" aria-label={`${property.property_name} tasks`}>
            {items.map((row) => (
              <MaintenanceRow
                key={row.item_id}
                row={row}
                propertyName={property.property_name}
                highlighted={row.item_id === highlightedId}
                onMarkDone={onMarkDone}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
