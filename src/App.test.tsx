import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function rowFor(itemId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`)
  if (!row) throw new Error(`No row for item ${itemId}`)
  return row
}

function rowText(itemId: string): string {
  return rowFor(itemId).textContent ?? ''
}

function visibleIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-item-id]')].map((row) => row.dataset.itemId ?? '')
}

function overdueTotal(): string {
  return screen.getByTestId('overdue-total').textContent ?? ''
}

function propertyHeadings(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '')
}

function viewSelect(): HTMLSelectElement {
  return screen.getByLabelText('View')
}

function viewOptions(): string[] {
  return [...viewSelect().options].map((option) => option.textContent ?? '')
}

function status(): HTMLElement {
  return screen.getByRole('status')
}

const ALL_IDS = Array.from({ length: 15 }, (_, index) => String(index + 1))

describe('App with a fixed local date of November 8, 2026', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows five property groups, fifteen tasks, and six overdue tasks in the default All tasks view', () => {
    render(<App />)
    expect(propertyHeadings()).toEqual([
      'Maple Crossing',
      'Harbor Point Plaza',
      'Oak Ridge Commons',
      'Pinewood Square',
      'Riverbend Center',
    ])
    expect(screen.getAllByRole('button', { name: /^Mark done/ })).toHaveLength(15)
    expect(overdueTotal()).toBe('6 overdue')
    expect(visibleIds()).toEqual(ALL_IDS)

    const overdueIds = ALL_IDS.filter((id) => rowText(id).includes('Overdue'))
    expect(overdueIds).toEqual(['1', '5', '6', '9', '13', '14'])
    expect(screen.getByText('November 8, 2026')).toBeInTheDocument()

    expect(viewSelect()).toHaveValue('all')
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (6)', 'Completed today (0)'])
    // The live region exists before any completion, and it is empty.
    expect(status()).toBeEmptyDOMElement()
  })

  it('marks item 1 done, changes only that task, ignores a same-day repeat, and resets on refresh', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    const others = Object.fromEntries(ALL_IDS.slice(1).map((id) => [id, rowText(id)]))

    expect(rowText('1')).toContain('Last completedNov 3, 2025')
    expect(rowText('1')).toContain('Next dueNov 3, 2026')
    expect(screen.getByTestId('overdue-P1')).toHaveTextContent('1 overdue')

    const button = screen.getByRole('button', { name: 'Mark done: Fire alarm inspection at Maple Crossing' })
    await user.click(button)

    const row = within(rowFor('1'))
    expect(row.getByText('Nov 8, 2026')).toBeInTheDocument()
    expect(row.getByText('Nov 8, 2027')).toBeInTheDocument()
    expect(row.getByText('Upcoming')).toBeInTheDocument()
    expect(overdueTotal()).toBe('5 overdue')
    expect(screen.getByTestId('overdue-P1')).toHaveTextContent('0 overdue')
    expect(status()).toHaveTextContent(
      'Fire alarm inspection at Maple Crossing marked done on Nov 8, 2026.Next due Nov 8, 2027.',
    )
    for (const [id, text] of Object.entries(others)) expect(rowText(id)).toBe(text)

    // The same button now reads Completed today, has a distinct name, and stays focusable.
    expect(screen.getByRole('button', { name: 'Completed today: Fire alarm inspection at Maple Crossing' })).toBe(button)
    expect(button).toHaveTextContent('Completed today')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (5)', 'Completed today (1)'])

    const afterFirst = rowText('1')
    await user.click(button)
    expect(rowText('1')).toBe(afterFirst)
    expect(overdueTotal()).toBe('5 overdue')

    // A page refresh starts again from the bundled CSV data.
    unmount()
    render(<App />)
    expect(rowText('1')).toContain('Next dueNov 3, 2026')
    expect(overdueTotal()).toBe('6 overdue')
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (6)', 'Completed today (0)'])
  })

  it('completes a task from the keyboard and keeps focus on the same, now aria-disabled, button', async () => {
    const user = userEvent.setup()
    render(<App />)
    const button = screen.getByRole('button', { name: 'Mark done: Pest control at Riverbend Center' })
    button.focus()
    await user.keyboard('{Enter}')

    expect(within(rowFor('14')).getByText('Upcoming')).toBeInTheDocument()
    expect(rowFor('14')).toContainElement(document.activeElement as HTMLElement)
    expect(document.activeElement).toBe(button)
    expect(button).toHaveAccessibleName('Completed today: Pest control at Riverbend Center')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(overdueTotal()).toBe('5 overdue')

    // The confirmation does not take focus.
    expect(status()).toHaveTextContent('Pest control at Riverbend Center marked done on Nov 8, 2026.')
    expect(status()).not.toContainElement(document.activeElement as HTMLElement)

    const afterFirst = rowText('14')
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(rowText('14')).toBe(afterFirst)
    expect(document.activeElement).toBe(button)
  })

  it('keeps the confirmation on the last real completion after a same-day repeat elsewhere', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Mark done: Fire alarm inspection at Maple Crossing' }))
    await user.click(screen.getByRole('button', { name: 'Mark done: Pest control at Riverbend Center' }))
    expect(status()).toHaveTextContent('Pest control at Riverbend Center marked done')

    await user.click(screen.getByRole('button', { name: 'Completed today: Fire alarm inspection at Maple Crossing' }))
    expect(status()).toHaveTextContent('Pest control at Riverbend Center marked done')
    expect(status()).not.toHaveTextContent('Fire alarm inspection')
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (4)', 'Completed today (2)'])
  })

  it('filters to one property, keeps portfolio totals, and counts views for that property', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Property'), 'Riverbend Center')

    expect(propertyHeadings()).toEqual(['Riverbend Center'])
    expect(screen.getAllByRole('button', { name: /^Mark done/ })).toHaveLength(3)
    expect(overdueTotal()).toBe('6 overdue')
    expect(viewOptions()).toEqual(['All tasks (3)', 'Due & overdue (2)', 'Completed today (0)'])
  })

  it('combines the property and view filters and keeps source order and accurate counts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(viewSelect(), 'due')

    expect(visibleIds()).toEqual(['1', '5', '6', '9', '13', '14'])
    expect(propertyHeadings()).toEqual(['Maple Crossing', 'Harbor Point Plaza', 'Oak Ridge Commons', 'Riverbend Center'])
    expect(screen.getByRole('region', { name: 'Maple Crossing' })).toHaveTextContent('1 task · 1 overdue')

    await user.selectOptions(screen.getByLabelText('Property'), 'Riverbend Center')
    expect(visibleIds()).toEqual(['13', '14'])
    expect(screen.getByRole('region', { name: 'Riverbend Center' })).toHaveTextContent('2 tasks · 2 overdue')
    expect(screen.getByRole('region', { name: 'Portfolio summary' })).toHaveTextContent('5 properties15 tasks6 overdue')
    expect(viewOptions()).toEqual(['All tasks (3)', 'Due & overdue (2)', 'Completed today (0)'])
  })

  it('moves focus to the View select when a completion removes the row from Due & overdue', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(viewSelect(), 'due')
    const button = screen.getByRole('button', { name: 'Mark done: Fire alarm inspection at Maple Crossing' })
    button.focus()
    await user.keyboard('{Enter}')

    expect(visibleIds()).toEqual(['5', '6', '9', '13', '14'])
    expect(propertyHeadings()).not.toContain('Maple Crossing')
    expect(document.activeElement).toBe(viewSelect())
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (5)', 'Completed today (1)'])
    expect(status()).toHaveTextContent('Fire alarm inspection at Maple Crossing marked done on Nov 8, 2026.Next due Nov 8, 2027.')
    expect(overdueTotal()).toBe('5 overdue')
  })

  it('opens Completed today from the confirmation, keeps the property, and focuses the View select', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Property'), 'Maple Crossing')
    await user.click(screen.getByRole('button', { name: 'Mark done: Fire alarm inspection at Maple Crossing' }))
    await user.click(within(status()).getByRole('button', { name: 'View completed today' }))

    expect(viewSelect()).toHaveValue('completed-today')
    expect(screen.getByLabelText('Property')).toHaveValue('P1')
    expect(document.activeElement).toBe(viewSelect())
    expect(visibleIds()).toEqual(['1'])
    expect(screen.getByRole('button', { name: 'Completed today: Fire alarm inspection at Maple Crossing' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(status()).toBeEmptyDOMElement()
  })

  it('dismisses the confirmation, returns focus to the completed row button, and keeps the scroll position', async () => {
    const user = userEvent.setup()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<App />)
    const button = screen.getByRole('button', { name: 'Mark done: Gutter cleaning at Pinewood Square' })
    await user.click(button)
    const region = status()
    focus.mockClear()
    await user.click(within(region).getByRole('button', { name: 'Dismiss confirmation' }))

    expect(status()).toBe(region)
    expect(region).toBeEmptyDOMElement()
    expect(document.activeElement).toBe(button)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    // The completion stays; only the message closes.
    expect(button).toHaveAccessibleName('Completed today: Gutter cleaning at Pinewood Square')
    focus.mockRestore()
  })

  it('dismisses to the row button when the item ID contains quotes and brackets', async () => {
    const user = userEvent.setup()
    const source = {
      ok: true as const,
      data: {
        properties: [{ property_id: 'P1', property_name: 'Maple Crossing', city: 'Greenville', state: 'SC' }],
        items: [
          { item_id: 'a"]b[', property_id: 'P1', task: 'Odd ID task', category: 'General', frequency_months: 1, last_completed: '2026-10-01' },
        ],
      },
    }
    render(<App source={source} />)
    const button = screen.getByRole('button', { name: 'Mark done: Odd ID task at Maple Crossing' })
    await user.click(button)
    await user.click(within(status()).getByRole('button', { name: 'Dismiss confirmation' }))
    expect(status()).toBeEmptyDOMElement()
    expect(document.activeElement).toBe(button)
  })

  it('dismisses to the View select when the completed row has left the view', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(viewSelect(), 'due')
    await user.click(screen.getByRole('button', { name: 'Mark done: Pest control at Riverbend Center' }))
    expect(visibleIds()).not.toContain('14')
    await user.click(within(status()).getByRole('button', { name: 'Dismiss confirmation' }))

    expect(status()).toBeEmptyDOMElement()
    expect(document.activeElement).toBe(viewSelect())
  })

  it('shows an empty state with a reset action when no task matches', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Property'), 'Pinewood Square')
    await user.selectOptions(viewSelect(), 'due')

    expect(visibleIds()).toEqual([])
    expect(propertyHeadings()).toEqual(['No tasks to show'])
    expect(screen.getByText('No tasks are due or overdue for this selection.')).toBeInTheDocument()
    expect(viewOptions()).toEqual(['All tasks (3)', 'Due & overdue (0)', 'Completed today (0)'])

    await user.selectOptions(viewSelect(), 'completed-today')
    expect(screen.getByText(/No tasks were completed today for this selection/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all tasks' }))
    expect(viewSelect()).toHaveValue('all')
    expect(screen.getByLabelText('Property')).toHaveValue('all')
    expect(document.activeElement).toBe(viewSelect())
    expect(visibleIds()).toEqual(ALL_IDS)
    expect(propertyHeadings()).toHaveLength(5)
  })

  it('refreshes today when the window regains focus', () => {
    render(<App />)
    expect(rowText('4')).toContain('Upcoming')

    vi.setSystemTime(new Date(2026, 10, 20, 9))
    act(() => {
      fireEvent.focus(window)
    })

    expect(screen.getByText('November 20, 2026')).toBeInTheDocument()
    for (const id of ['4', '8', '10']) expect(rowText(id)).toContain('Due today')
    expect(overdueTotal()).toBe('6 overdue')
    // Due & overdue includes due-today tasks.
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (9)', 'Completed today (0)'])
  })

  it('empties Completed today after midnight on the next focus refresh', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Mark done: Fire alarm inspection at Maple Crossing' }))
    await user.selectOptions(viewSelect(), 'completed-today')
    expect(visibleIds()).toEqual(['1'])

    vi.setSystemTime(new Date(2026, 10, 9, 0, 5))
    act(() => {
      fireEvent.focus(window)
    })

    expect(screen.getByText('November 9, 2026')).toBeInTheDocument()
    expect(visibleIds()).toEqual([])
    expect(screen.getByRole('heading', { name: 'No tasks to show' })).toBeInTheDocument()
    expect(viewOptions()).toEqual(['All tasks (15)', 'Due & overdue (5)', 'Completed today (0)'])
    // The message keeps its true completion date but no longer offers today's view.
    expect(status()).toHaveTextContent('marked done on Nov 8, 2026.')
    expect(within(status()).queryByRole('button', { name: 'View completed today' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all tasks' }))
    expect(screen.getByRole('button', { name: 'Mark done: Fire alarm inspection at Maple Crossing' })).not.toHaveAttribute(
      'aria-disabled',
    )
  })

  it('saves the new local day on the first click after midnight, with no focus event', async () => {
    const user = userEvent.setup()
    vi.setSystemTime(new Date(2026, 10, 8, 23, 59))
    render(<App />)
    const button = screen.getByRole('button', { name: 'Mark done: Pest control at Riverbend Center' })
    await user.click(button)
    expect(button).toHaveAttribute('aria-disabled', 'true')

    // The page stays focused across midnight, so no refresh event runs.
    vi.setSystemTime(new Date(2026, 10, 9, 0, 1))
    expect(screen.getByText('November 8, 2026')).toBeInTheDocument()
    await user.click(button)

    expect(screen.getByText('November 9, 2026')).toBeInTheDocument()
    expect(rowText('14')).toContain('Last completedNov 9, 2026')
    expect(rowText('14')).toContain('Next dueDec 9, 2026')
    expect(status()).toHaveTextContent('Pest control at Riverbend Center marked done on Nov 9, 2026.Next due Dec 9, 2026.')
    expect(button).toHaveAccessibleName('Completed today: Pest control at Riverbend Center')
  })

  it('shows the data error panel and no task list for invalid input', () => {
    render(<App source={{ ok: false, errors: ['sample_maintenance_items.csv, data row 3: duplicate item_id "2"'] }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Maintenance data could not load')
    expect(screen.getByRole('alert')).toHaveTextContent('duplicate item_id "2"')
    expect(screen.queryAllByRole('button', { name: /^Mark done/ })).toHaveLength(0)
    expect(screen.queryByLabelText('View')).not.toBeInTheDocument()
  })
})

describe('App on October 31, 2026, when a source row was completed today', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 31, 10))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists item 2 under Completed today as a recurring Upcoming task and ignores a click on it', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(viewOptions()[2]).toBe('Completed today (1)')

    const button = screen.getByRole('button', { name: 'Completed today: Landscaping service at Maple Crossing' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(rowText('2')).toContain('Next dueNov 30, 2026')
    expect(rowText('2')).toContain('Upcoming')

    await user.selectOptions(viewSelect(), 'completed-today')
    expect(visibleIds()).toEqual(['2'])
    expect(propertyHeadings()).toEqual(['Maple Crossing'])

    const before = rowText('2')
    await user.click(button)
    expect(rowText('2')).toBe(before)
    expect(status()).toBeEmptyDOMElement()
    expect(visibleIds()).toEqual(['2'])
  })
})
