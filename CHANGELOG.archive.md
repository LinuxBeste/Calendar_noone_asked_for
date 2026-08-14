# Changelog archive

Released versions that have been superseded. Newest changes live in
[CHANGELOG.md](./CHANGELOG.md).

## [0.6.8]

### Added

- **Plugins system** — a built-in plugin catalog (starting with the daily
  quote and smart tags plugins) can decorate events with extra content; a
  Settings → Plugins panel enables/disables plugins, and per-user plugin
  state and data are stored server-side.
- **Preview-first event clicks** — clicking an event opens a quick preview
  instead of jumping straight into the editor.
- **Drag-to-resize events** — dragging an event's bottom edge changes its
  duration.
- **Animations** — transitions and motion polish across views and dialogs.
- **"Today" navigation fix** — the Today button now lands on the correct
  week/day.
- **Desktop launcher icon** — the packaged desktop app ships a proper
  launcher icon.

### Fixed

- **Recurring events in narrow ranges** — occurrence expansion queried the
  wrong range, so series could show stale or missing occurrences; the
  recurring-range queries now match the requested window.
- **Plugin state load guard** — loading plugin state no longer trips over
  missing data at startup.

## [0.6.7]

### Added

- **Pinch-to-zoom on the week view for phones** — spread two fingers to zoom
  in (max 200%), pinch together to zoom back out; a stale gesture can no
  longer swallow your scroll afterwards. The +/− controls now sit above the
  "New event" button instead of hidden underneath it.

## [0.6.6]

### Added

- **Auto-updates on every platform** —
  - Android: the app checks GitHub once per day (silently, throttled) and
    shows a notification ("Update available — open Settings to install") plus
    a Settings → Updates panel with a manual "Check for updates" button; the
    download opens in the system browser and installs like any APK.
  - Desktop (Windows/macOS/Linux): a "Check for updates…" entry in the tray
    menu and an Updates panel in Settings that triggers the built-in updater
    with the usual download/restart confirmation dialogs.
  - The web demo is always served as the latest version, so it needs no
    updater itself.

## [0.6.5]

### Added

- **Offline mode for installed clients (Android, desktop)** — the app keeps a
  local cache of events, calendars, trash and settings. When the server can't
  be reached it no longer blocks on a connection screen: the app opens with
  the cached data, shows an "Offline" banner, and every event change
  (create / edit / delete, single occurrences, series splits, settings) is
  queued with a "saved offline" confirmation. The moment the server is back
  (automatic polling, network events, or the Retry button) the queued changes
  are replayed and all data refreshes — no data loss, no manual resolution.
- **Connection handling overhaul** — requests have timeouts (8 s) and failed
  requests mark the client offline immediately; while offline a watch polls
  the server every 8 s; the full-screen "Backend unreachable" gate only
  appears when there is nothing cached yet (e.g. first install), and even it
  now retries automatically.

### Fixed

- **Network blips logged you out** — session validation that fails because the
  server is unreachable no longer drops the token; the cached session (and
  user) is kept so the app can start offline.
- **Capacity WebView origins rejected** — the Android app (native shell,
  bundled UI, API-only traffic) sends `Origin: https://localhost`; those
  requests are now in the CORS default allowlist (plus legacy
  `capacitor://localhost`).
- **Background setting loads spammed errors while offline** — the per-key
  settings fetch is now guarded and keeps cached values instead of raising
  unhandled rejections for every key.

## [0.6.4]

### Added

- **Server address is now configurable in settings** — phones can't reach a
  "localhost" that lives on your PC, so Settings gained a Server field that
  stores the API URL (e.g. `http://192.168.1.50:3001` on a real phone,
  `http://10.0.2.2:3001` on the Android emulator).

### Fixed

- **Backend rejected same-origin mobile browsers** — browsers send an `Origin`
  header on same-origin requests, and the CORS allowlist only knew dev hosts,
  so the app served from a LAN IP or `localhost:3001` got HTTP 400 on every
  request (assets, login, fetch). Same-origin requests (Origin matching the
  request's Host) now skip the CORS check and are treated as trusted.

## [0.6.3]

### Added

- **Mobile-first UI for phones** — the app now behaves like a native Android
  app on small screens: a bottom navigation bar (Day / Week / Month / Year /
  Agenda) replaces the desktop view switcher, a floating action button opens
  the event dialog, dialogs slide up as bottom sheets (event, settings,
  confirm, trash, find-free-time), the sidebar starts closed and overlays the
  content as a drawer, toasts float above the bottom bar, and every layout
  respects device safe areas (notches, gesture bars).

### Fixed

- **Sidebar drawer opened over dialogs** — on narrow screens the drawer
  rendered above open dialogs (same z-index, later in the DOM) and started
  open on every launch; it now starts closed, layers below dialogs, and the
  hamburger button got a bigger touch target.

## [0.6.2]

### Fixed

- **Demo events clustered at 02:00** — the demo recurrence engine expanded
  series on UTC day boundaries while the seed times were local, so every
  recurring event landed at midnight UTC (02:00 in summer time) instead of its
  scheduled time. Expansion now keeps the local time of day.
- **Demo didn't cover the feature set** — the seed now has 25 events spread
  across the whole day (morning run → movie night): 2-way and 3-way
  overlapping meetings (Thursday 14:00 shows the side-by-side layout),
  weekend-only series, free slots, icons, locations, descriptions,
  timezone-aware and multi-day timed events, plus a cancelled and a
  rescheduled occurrence of the daily standup.
- **Uncaught errors left the user blind** — errors and failed promises outside
  components (background refreshes, undo/redo, trash actions, storage) now
  surface as toasts, are logged, and never take the app down; failed
  background refreshes keep the previously loaded events instead of clearing
  the calendar.
- **Overlapping events stacked instead of side-by-side** — the week-view
  layout sweep stored each event's column group size in a copy, so earlier
  events never learned that the group had grown: with 3+ overlapping events
  the left one kept the 2-column width and the right ones overlapped. The
  sweep now updates the rendered entries directly.
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
## [0.5.12] - 2026-08-13

### Fixed

- **CI / Pages deploys could fail on `npm install`** — installing the
  dependency tree downloads the Electron binary on every job, and a socket
  hang-up on the download killed the GitHub Pages deploy and CI runs.
  Jobs that don't package Electron now skip the binary download
  (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); installer jobs retry `npm install`
  once.
- **Service worker could serve stale assets** — the cache was never
  version-bumped (`calendar-v1`) and the fetch handler answered with the
  cached copy first, so returning visitors could be served an older app
  build. Cache is now `calendar-v2` (old caches purged on activate) and all
  requests are network-first with cache as offline fallback.
- **Demo live version didn't load** — the auth store reads the session token at
  module load, before demo mode seeds it, so `boot()` never restored a session
  and the demo dropped visitors onto the sign-in screen instead of the seeded
  calendar. `boot()` now falls back to re-reading the token from
  `localStorage`, so the live demo auto-logs-in.
- **Demo could freeze the whole tab** — the recurring demo events were seeded
  with `start`/`end` instead of `startsAt`/`endsAt`, so every recurrence had an
  invalid start date; expanding them produced `NaN` week starts and the
  WEEKLY/MONTHLY expansion loops never terminated, hanging the page on
  returning visits (only a fresh visit worked, with no events shown at all).
  Seed data now uses the correct keys and the expansion loops bail out on
  non-finite values.
- **Linux `.deb` missing from releases** — the installer job built the `.deb`
  but the workflow uploaded the no-longer-produced `.tar.gz` instead, so the
  Linux package never reached the release. The upload pattern now ships
  `.AppImage` + `.deb`.

### Added

- **Live downloads page** — `downloads.html` on GitHub Pages lists the
  current platform's installer first and resolves the latest version from the
  GitHub API on every visit: Windows installer/portable, macOS `.dmg`/`.zip`,
  Linux `.deb`/`.AppImage`/`.zip`, Android `.apk`, with a fallback link to the
  releases page.
- **Linux portable `.zip`** — the Linux build now ships a plain `.zip`
  package alongside the `.deb` installer and `.AppImage`, so Linux users get
  a portable download like the other platforms.
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

## [0.6.0] - 2026-08-13

### Fixed

- **Agenda view could freeze the whole tab** — `from`/`to` were recreated on
  every render, so the refresh effect re-ran after every event fetch, which
  updated the store, which re-rendered — an endless loop that locked up the
  renderer (Agenda view only; other views memoized their range). The range is
  now memoized like the other views.
- **Events from unchecked calendars still shown** — hiding a calendar only
  stopped fetching, so events already in the store kept appearing in every
  view. All views now filter by calendar visibility, and toggling a calendar
  refetches the current range.

### Changed

- **Product renamed to Calendar** — the app is now called "Calendar" in the
  UI, release notes, and package metadata (repo, image names, and previous
  releases keep their old names).

## [0.6.9] - 2026-08-14

### Added

- **Full date in the header** — the toolbar now shows the complete date
  (e.g. "Friday, August 14, 2026") above the view title, so you always see
  exactly which day you're looking at.
- **Swipe navigation on the week view (touch)** — swipe left to move one week
  forward, swipe right to move one week back. Swipes starting on an event chip
  are left alone so drag-and-drop keeps working.
