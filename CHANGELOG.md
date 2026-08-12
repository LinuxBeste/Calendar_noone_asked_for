# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work.

## [Unreleased]

### Fixed

- **Demo live version didn't load** — the auth store reads the session token at
  module load, before demo mode seeds it, so `boot()` never restored a session
  and the demo dropped visitors onto the sign-in screen instead of the seeded
  calendar. `boot()` now falls back to re-reading the token from
  `localStorage`, so the live demo auto-logs-in.

### Added

- **Android / mobile support** — touch drag & drop in week and month views
  (drag-to-create via long-press, move/resize events, drop ghost), native
  notifications via `@capacitor/local-notifications` (reminders fire even in
  the background; new `GET /reminders/upcoming` endpoint), native share sheet
  for public calendar links, hardware back button (closes dialogs → back to
  previous view → minimize), emulator-friendly default API URL
  (`http://10.0.2.2:3001`), and a responsive layout for phone → tablet →
  desktop (sidebar drawer, stacking settings dialog, dynamic week column
  widths, dynamic viewport height)
- **Settings search** — search box in the settings dialog filters every
  setting across all categories (both Electron and web/Android clients)
- **ICS feed subscriptions** — subscribe to external `.ics` URLs; events are
  synced automatically (configurable interval, default 15 min), stored
  read-only, and editable API calls on feed events are rejected
  (`POST /feeds`, `GET /feeds`, `DELETE /feeds/:id`, `POST /feeds/:id/sync`)
- **Share by link** — public read-only share links per calendar with a public
  view page, occurrences endpoint and `.ics` feed; subscribe to other people's
  links from the sidebar (no account needed) (`POST /calendars/:id/link`,
  `GET /public/:token[/events|/ical]`)
- **Tray mode (desktop)** — closing the window hides the app to the system
  tray instead of quitting, so reminder notifications keep firing while the
  app is "closed"; tray menu with Open/Quit
- **Server hardening** — per-user WebSocket fan-out (users only get pushes for
  calendars they can read), trash auto-purge (`CALENDAR_TRASH_DAYS`, default
  30), daily SQLite backups with rotation (`CALENDAR_BACKUPS_DIR`,
  `CALENDAR_BACKUP_KEEP`), auth rate limiting (10 attempts / 5 min)
- **Client unit tests** — quick-add parser and event-template suites (Vitest)
- **Offline demo mode** — no-login demo build (seeded calendars and events,
  reset on reload) deployed to GitHub Pages; demo banner shown in-app
- **PWA** — web app is installable and runs offline once loaded
  (`manifest.webmanifest`, service worker, generated icons)
- **First-run tour** — five-step onboarding overlay (demo mode only)
- **Upcoming-event notifications** — the app natively notifies before events
  (configurable window), on top of existing full-day reminders; web engine
  checks while the tab runs, honoring silent hours
- **QR share links** — sidebar share dialog shows a QR code per public link
  ("Scan to open on your phone")
- **Material icons** — app icons (incl. Android launcher/splash) regenerated
  from the Material "event" glyph with a consistent blue `#1a73e8` background
- **CI check job** — typecheck + unit tests gate all release artifacts
- **Version display** — app version shown in the settings dialog footer and on
  the connection screen

### Fixed

- `purgeEvent` referenced an undefined variable (`existing.calendarId`),
  which would have crashed on purge (caught by `tsc`)
- Connection screen now shows validation and per-state error messages
- Settings/tour setup only triggers when creating a new account, not on login
- Toolbar wraps on narrow screens and the search results dropdown is no longer
  clipped
- Boolean settings in the settings dialog showed their name twice (the label
  was rendered both as the row title and inside the checkbox control)
- Settings dialog tabs now stack horizontally on narrow screens and the
  dialog is scrollable on mobile

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
