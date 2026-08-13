# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Fixed

- **Agenda view could freeze the whole tab** — `from`/`to` were recreated on
  every render, so the refresh effect re-ran after every event fetch, which
  updated the store, which re-rendered — an endless loop that locked up the
  renderer (Agenda view only; other views memoized their range). The range is
  now memoized like the other views.
- **CI / Pages deploys could fail on `npm install`** — installing the
  dependency tree downloads the Electron binary on every job, and a socket
  hang-up on the download killed the GitHub Pages deploy and CI runs.
  Jobs that don't package Electron now skip the binary download
  (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); installer jobs retry `npm install`
  once.

### Added

- **Live downloads page** — `downloads.html` on GitHub Pages lists the
  current platform's installer first and resolves the latest version from the
  GitHub API on every visit: Windows installer/portable, macOS `.dmg`/`.zip`,
  Linux `.deb`/`.AppImage`/`.zip`, Android `.apk`, with a fallback link to the
  releases page.
- **Linux portable `.zip`** — the Linux build now ships a plain `.zip`
  package alongside the `.deb` installer and `.AppImage`, so Linux users get
  a portable download like the other platforms.

### Fixed

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

