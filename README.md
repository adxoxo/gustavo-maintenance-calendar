# Preventative Maintenance Calendar

A small browser app for property managers. It lists every recurring maintenance task under its property, shows each next due date, flags overdue work, and lets a user mark a task done. A View select shows all tasks, only due and overdue tasks, or only tasks completed today.

The app reads the two supplied CSV files. It has no server, database, login, or persistent storage.

## Setup and commands

Prerequisite: Node.js `^22.12.0 || ^24.0.0 || >=26.0.0` (the Vitest test runner sets this minimum). Development and checks used Node 24.20.0 and npm 11.19.0.

```bash
npm ci              # install the exact versions in package-lock.json
npm run dev         # development server, normally http://localhost:5173/
npm test            # unit, loader, App journey, and walkthrough reference checks
npm run lint        # ESLint
npm run build       # regenerate the walkthrough, type-check, and build into dist/
npm run preview     # serve the production build from dist/
npm run docs        # regenerate public/developer-walkthrough.html only
npm run docs:check  # exit 1 if the walkthrough is out of date
```

## How it works

```text
src/data/*.csv  ──?raw import──▶  loadMaintenance()  ──ok──▶  App state: items + today
                                       │                          │
                                       └──errors──▶ DataError     ▼
                                                    buildPropertyGroups(properties, items, today)
                                                      └─ toMaintenanceRow → addMonthsClamped + getStatus + completed_today
                                                          ▼
                                       property filter → countViews (View counts) → filterGroupsByView
                                                          ▼
                                                    PropertySection → MaintenanceRow → Mark done
                                                          │
handleMarkDone(item_id) ─ todayLocal() once ─ guard: done on that date? stop
                        └─ setItems(prev => completeItem(prev, id, date)) + floating confirmation
```

| Path | Purpose |
| --- | --- |
| `src/data/sample_*.csv` | Unchanged copies of the supplied data |
| `src/data/source.ts` | Imports both CSV files as text and calls the loader once per page load |
| `src/data/loadMaintenance.ts` | Papa Parse plus field, date, frequency, duplicate-ID, and property-reference validation |
| `src/domain/types.ts` | `Property`, `MaintenanceItem`, derived `MaintenanceRow` (with `completed_today`), `PropertyGroup`, `TaskView`, `ViewCounts`, `LoadResult` |
| `src/domain/dates.ts` | `todayLocal`, `addMonthsClamped`, `getStatus`, date validation and display |
| `src/domain/maintenance.ts` | `completeItem`, `toMaintenanceRow`, `buildPropertyGroups`, `matchesView`, `countViews`, `filterGroupsByView` |
| `src/App.tsx` | Page state, today refresh, `handleMarkDone`, property and View filters, counts, empty state, floating confirmation and its handlers |
| `src/components/*.tsx` | Property section, task row, and data error panel |
| `scripts/` | Walkthrough generator and its reference checks |

- **Data read.** Vite bundles both CSV files as strings. The loader parses them with Papa Parse, which handles quoted commas, LF, CRLF, and blank lines. IDs stay strings. `frequency_months` becomes a positive safe integer.
- **Invalid data.** Any missing column, empty field, impossible date, bad frequency, duplicate ID, or unknown `property_id` shows an error panel with every problem. The page never shows a partial task list.
- **State.** Domain data state is the item array and today's date. UI state is the property filter, the view (`all`, `due`, or `completed-today`), the highlighted row (`lastCompletedId`), and the task in the confirmation (`confirmationId`). A ref (`focusCheckId`) records a completion for one focus check after render. Properties are fixed. Next due dates, statuses, `completed_today`, groups, view counts, and overdue counts are derived on each render, so they cannot disagree with the stored completion dates.
- **Mark done.** The handler reads the clock once and stores that date as today. If the item was already completed on that date, it stops: this covers the Completed today button and a same-day repeat. Otherwise it calls a functional updater. `completeItem` copies only the selected item with the new `last_completed`. Other item objects stay the same.
- **Views.** The property filter runs first. `countViews` counts its rows for the View options, so the counts follow the selected property. `filterGroupsByView` then keeps matching rows in source order, recounts each section's overdue rows, and removes empty sections. The portfolio summary always counts the whole portfolio.

## Visual design

- The layout follows the approved mockup: property sections, a wide task grid on desktop, and stacked labeled rows on narrow screens.
- The visual brand follows https://www.ziffcre.com/: navy `#223562` for text and actions, teal `#65A6AF` for borders and highlights only, surface `#F5F6F9`, border `#E3E6EC`, secondary text `#5E5E5E`, square controls, and tracked uppercase labels.
- `src/assets/ziff-logo.png` is the unchanged official logo (SHA-256 `4a4dd60f462d67f61133f68be97da7a77a43b61c09c88c6dac14bcc797c37878`).
- The CSS names the site's Adobe Fonts first (Sofia Pro for body text, Aktiv Grotesk Extended for headings). Those font files are not bundled or downloaded. The bundled Geist and Geist Mono files (SIL Open Font License, `src/assets/fonts/GEIST-OFL.txt`) are the offline fallback.
- Controls are at least 44px tall, focus is visible, and status uses text with color.

## Date rules and assumptions

- "Today" is the user's local calendar date, from local year, month, and day fields. The app never uses `toISOString()` for today.
- Next due = `last_completed` + `frequency_months` calendar months. If the day does not exist in the target month, the last day of that month is used. For example, 2026-01-31 + 1 month = 2026-02-28, and 2024-01-31 + 1 month = 2024-02-29.
- Overdue means the next due date is before today. A task due today shows **Due today** and is not overdue.
- Mark done sets `last_completed` to today, so the next cycle starts from the completion date, not from the old due date. A second click on the same day changes nothing.
- **Due & overdue** shows tasks with `next_due` on or before today, so it includes due-today tasks.
- **Completed today** shows tasks with `last_completed` equal to today, including a source row with today's date. It is not a permanent state: a recurring task keeps its next due date and its Upcoming status.
- Dates are compared as zero-padded `YYYY-MM-DD` strings. All supplied properties are in US time zones, so the user's local date is the working assumption.

At a local date of November 8, 2026, the supplied data shows five properties, fifteen tasks, and six overdue tasks: items 1, 5, 6, 9, 13, and 14.

## Refresh behavior

- Changes live in memory only. A page refresh restores the CSV values, as the brief permits.
- The app reads today again when the window gets focus, when a hidden tab becomes visible, and on each Mark done click. It does not run a timer at midnight. A page left open and focused across midnight updates on the next focus, tab return, or click.
- After midnight, the refresh empties **Completed today** and brings back **Mark done** for yesterday's tasks. The handler compares only with the freshly read date, so the first click after midnight saves the new day even when the displayed date is stale.

## Developer walkthrough

`public/developer-walkthrough.html` is a single offline HTML file, linked from the app footer. It traces the CSV read path and the Mark done path in six steps each, including the View filter, the Completed today button, and the floating confirmation. It also lists fields, page UI state, functions, components, and date, view, and focus rules.

Every `path:line` link comes from the actual source. `scripts/generate-walkthrough.mjs` finds each function, field, call site, state write, and JSX element in the TypeScript syntax tree, and it fails if a target is missing or ambiguous. The links open an embedded copy of the referenced source files with the target line highlighted. The file needs no server, CDN, or editor.

`npm run build` regenerates the file first. After a source edit during development, run `npm run docs` (or `npm run docs:check` to confirm it is current). The step data snapshots are explanatory examples fixed to November 8, 2026; the code excerpts are current source lines.

## Tests

- `src/domain/dates.test.ts`: month-end clamps (including items 2, 3, 11, and 15), leap year, year change, due-today boundary, local midnight, date validation.
- `src/domain/maintenance.test.ts`: grouping and overdue IDs with the real CSVs, single-item completion without mutation, same-day repeat, unknown ID, `completed_today`, the due-today view boundary, view counts, and view filtering that recounts overdue rows and removes empty groups.
- `src/data/loadMaintenance.test.ts`: supplied files (including the CRLF properties file), quoted commas, blank lines, and each rejection rule.
- `src/App.test.tsx`: the user journey with a frozen local date (`vi.useFakeTimers({ toFake: ['Date'] })`): counts, Mark done on item 1, the Completed today button name and `aria-disabled` state, unchanged neighbors, same-day repeat, refresh reset, keyboard completion with kept focus, property filter, combined filters and View counts, completion in each view, focus to View when a row leaves Due & overdue, View completed today, Dismiss with kept scroll and row focus, the empty state and reset, focus refresh of today, Completed today after midnight, the first click after midnight with no focus event, a source row completed today, and the error panel.
- `scripts/walkthrough.test.mjs`: every documented reference lands on the intended line, and the generated file is portable and offline.

## Optional features

- **Property filter** (from the brief's nice-to-have list): one select with an **All properties** default. Portfolio totals stay portfolio-wide.
- **View filter:** a labeled **View** select with **All tasks** (default), **Due & overdue**, and **Completed today**. Each option shows its count for the selected property. When no task matches, an empty state explains why and offers **Show all tasks**, which resets both filters.
- **Portfolio and property overdue counts:** a manager sees where late work is without a scan of every row. A section in a filtered view shows its visible task and overdue counts.
- **Completed today button:** after Mark done, the row's button reads **Completed today** with the name "Completed today: task at property". It uses `aria-disabled="true"`, not `disabled`, so keyboard focus stays on it. The handler ignores a click on it.
- **Floating confirmation:** a message fixed to the bottom right of the viewport names the task, its property, the completion date, and the next due date. It never moves the task list and never takes focus. It sits in an always-present `role="status"` live region. **View completed today** opens that view, keeps the property, and focuses the View select. **Dismiss confirmation** closes it and returns focus to the row's button (or the View select if the row is not shown) without a scroll. It has no auto-dismiss timer. No manual screen-reader test was run.
- **Focus when a row leaves:** a completion in **Due & overdue** removes the row from the view, so focus moves to the View select after render.
- **Today refresh on return:** a tab left open overnight shows correct statuses when the user comes back.

## Not included

- Sorting by most overdue was left out. It would move a row after Mark done and could lose keyboard focus; the source order is kept instead. The view filters keep source order too.
- No category filter, persistence, CSV upload, editing, reminders, calendar grid, or backend. These are outside the brief.
- No midnight timer while the page stays focused (see Refresh behavior).
