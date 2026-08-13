# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Added

- **Pinch-to-zoom on the week view for phones** — spread two fingers to zoom
  in (max 200%), pinch together to zoom back out; a stale gesture can no
  longer swallow your scroll afterwards. The +/− controls now sit above the
  "New event" button instead of hidden underneath it.
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

## [0.6.5] - 2026-08-13

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


