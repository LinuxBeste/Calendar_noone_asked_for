# Changelog

Released versions older than the latest are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Added
- Scheduled dark mode, accent follows calendar, more accent presets.
- "Month + Agenda" split view (toolbar, keyboard `s`, mobile nav, command palette).
- Birthdays & contacts: manage contacts (sidebar), birthdays shown as yearly all-day events on a virtual calendar (read-only previews, synced via settings).

## [0.6.10] - 2026-08-14

### Added
- Swipe navigation on the month view (touch); motion polish throughout the UI.

### Changed
- Server: structured pino logging (levels/pretty/file/redaction), typed error codes, request correlation + audit trail, hardening (20 MB cap, 30 s timeout, CORS 403, typed 404).
- Client: backend errors mapped to friendly messages, per-field validation hints, consistent error toasts, error boundary "Try again", 30 s API timeout with offline banner.

### Fixed
- Security: calendar access leak, share-link ownership, feed SSRF, token redaction in logs.
- iCal: timezone/DST export-import bugs; import crash robustness; phantom "split series" events.
- Views: resize request spam, week-view DnD minute, click-to-create time, Sunday-start headers, year-view jump, mini-calendar dots, find-free-time slots.
- Data: stale-refresh overwrites, offline queue stall, missing delete feedback, Redis crash, reminder scans, PG connection leak, clean shutdown.
