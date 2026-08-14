# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Added
- **Full date in the header** — the toolbar now shows the complete date
  (e.g. "Friday, August 14, 2026") above the view title, so you always see
  exactly which day you're looking at.
- **Swipe navigation on the week view (touch)** — swipe left to move one week
  forward, swipe right to move one week back. Swipes starting on an event chip
  are left alone so drag-and-drop keeps working. The week now slides out and
  the next one slides in with a short fade animation instead of snapping.
- **Swipe navigation on the month view (touch)** — the same gesture now works
  on the month grid: swipe left for the next month, right for the previous
  one, with the same slide-out/slide-in animation.
- **Polished motion everywhere** — toasts pop in, the mobile sidebar slides in
  from the left with a fading backdrop, context menus scale in, every dialog
  backdrop fades in, and the header date gently fades up whenever you navigate
  to a different day, week or month.

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

### Fixed

- **Calendar leak via the API** — `calendarIds` sent by clients are no longer
  trusted: every event listing (views, search, occurrence expansion, iCal
  export) is resolved server-side against the calendars the user can actually
  read, so a crafted request can no longer see other users' events. An empty
  calendar list now means "all calendars you can read" instead of "no
  filter". Shared-calendar iCal export also works again (it was restricted to
  owned calendars only).
- **Share links were not owner-only** — listing and deleting public share
  links required only "can read" access; both now require ownership, and
  deleting a link verifies it belongs to the calendar being deleted.
- **Calendar feed SSRF** — the ICS feed fetcher now blocks private/link-local/
  multicast/loopback hosts (via DNS resolution), rejects non-http(s) URLs,
  caps the body at 2 MB, follows at most 5 redirects, and skips feeds that are
  already syncing. Feed errors are stored and shown instead of failing
  silently, and a feed-sync button/`syncAll` cover the full queue.
- **Tokens leaked into server logs** — the request logger now redacts `token=`
  query parameters and `/public/…` share URLs, so session and share tokens no
  longer end up in logs.
- **"Split series" could create a phantom event** — splitting on an
  occurrence that no longer existed fell back to a silent, undated event;
  it now throws a clear error. Occurrence matching is done in UTC so clients
  and server in different timezones agree on the same occurrence.
- **iCal export/import timezone bugs** — timed events were exported as naive
  local wall time (imported back at the wrong hour, or shifted when opened in
  Google Calendar); they are now exported as UTC (`…Z`). All-day `DTEND` was
  off by one day (inclusive vs. exclusive) and is now spec-compliant in both
  directions, including on DST boundary days.
- **iCal/JSON import could crash the server** — invalid JSON, malformed
  calendars, oversized/colored calendar names and invalid event payloads are
  validated per item instead of trusting the upload.
- **Resizing events spammed the API** — dragging an event's bottom edge fired
  one update request per pointer move; both the timed and the all-day resize
  now commit once on release. Multi-day *timed* events no longer render
  twice (all-day row plus grid segments), and zero-length grid segments are
  skipped.
- **Week-view drag-and-drop landed at the wrong minute** — the day column
  lookup matched the header cell (first in the DOM), so drops computed the
  minute from the header's rect; it now uses the grid cell.
- **Click-to-create ignored the clicked time** — opening the event dialog by
  clicking the week grid started the event at 09:00; the clicked time is now
  pre-filled.
- **Month view header misaligned on Sunday start** — the weekday header
  rotated the wrong way when "Week starts on Sunday" was selected; the year
  view month header had the same issue.
- **Year view navigated to January** — clicking a month name built an invalid
  date (`new Date("2026-August-01")`) and jumped to January; it now opens the
  clicked month.
- **Event dots in the mini calendar could be off by a day** — occurrence
  dates were taken from UTC instants instead of the user's local date.
- **Find free time showed false slots** — it used only the currently loaded
  view range (and ignored recurrence outside it); it now fetches the actual
  requested range from the server and blocks every occurrence of recurring
  events.
- **Stale data could overwrite fresh data** — concurrent event refreshes
  raced: a slow, older response landing last clobbered newer data. Out-of-date
  responses are now discarded, and full-range refreshes no longer replace the
  view's refresh range (which made "refresh visible" fetch the entire
  database).
- **Offline queue could stall forever** — a queued change rejected with a 4xx
  (validation, 404, expired session) blocked the whole queue on every retry;
  permanently failing operations are now dropped (with a toast) and the rest
  of the queue drains.
- **Deleting an event gave no feedback on failure** — confirm dialogs
  swallowed errors; the error message now appears inside the dialog.
- **Redis cache could crash the server** — an ioredis `error` event with no
  listener kills the process when the retry strategy gives up; connection and
  subscriber errors are now handled, and cache invalidation uses `SCAN`
  instead of blocking `KEYS`. The in-memory fallback cache is capped so it
  can't grow without bound.
- **Reminder scans loaded every event** — the reminder queries now filter in
  SQL (with an index) instead of joining and scanning all events in memory.
- **PostgreSQL fallback leaked connections** — when PG was configured but
  unavailable, the abandoned pool was left open; it is now closed before
  falling back to SQLite.
- **Server shutdown was abrupt** — SIGTERM/SIGINT now stops intervals, the
  HTTP server, the cache and the database cleanly.

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


