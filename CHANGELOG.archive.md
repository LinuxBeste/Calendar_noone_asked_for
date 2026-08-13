# Changelog archive

Released versions that have been superseded. Newest changes live in
[CHANGELOG.md](./CHANGELOG.md).

## [0.2.0] - 2026-08-07

### Added

- **Settings catalog** — 124 settings across 10 categories defined once in
  `shared/settings.ts`; the server derives validation from the catalog and
  the SettingsDialog is fully data-driven
- **Week/day view** — zoom (Ctrl+wheel + controls), fit-to-screen, scroll
  preservation, time gutter width options, quarter-hour lines, now-line
- **Live updates** — WebSocket push for event/calendar changes across all
  connected clients (per-user filtering added later)
- **Drag & drop** — drag-to-create (drag on the grid to draft an event),
  toast with undo hint after moving events
- **Keyboard shortcuts** — `j`/`k` navigate, plus settings-gated `n`, `q`,
  `?`, view keys
- **Agenda view rewrite** — sorting, past-collapse, grouping by week,
  per-day limits with "+n more", holidays, 12/24h formats, past opacity
- **Month view settings** — holidays, trailing days, week numbers, event
  styles (bar/dot/compact), weekend shading, drag & drop gate, hover preview,
  event times, today ring
- **Multi-day events** — timed events spanning ≥ 3 dates now also appear as
  bars in the all-day band
- **Event opacity** — global setting applied to week/month rendering

### Changed

- Event editability is an explicit allow-list (owner/editor), so unknown or
  read-only calendars can never be edited
- Default calendar is created on first register/login

## [0.1.0] - 2026-07-01

Initial release: Electron + React calendar with day/week/month/year/agenda
views, recurring events (RRULE) with exceptions and series split, multi-user
accounts, calendar sharing, reminders with OS notifications, iCal
import/export, JSON backup, undo/redo, search, dark mode, and a standalone
Fastify backend with SQLite/PostgreSQL + Redis, plus a web/Android client.