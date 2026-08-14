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
