# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Added
- **Swipe navigation on the month view (touch)** — the same gesture now works
  on the month grid: swipe left for the next month, right for the previous
  one, with the same slide-out/slide-in animation.
- **Polished motion everywhere** — toasts pop in, the mobile sidebar slides in
  from the left with a fading backdrop, context menus scale in, every dialog
  backdrop fades in, and the header date gently fades up whenever you navigate
  to a different day, week or month.

### Changed

- **Structured server logging & typed API errors** — the server now logs
  through pino (ISO timestamps, `CALENDAR_LOG_LEVEL`, request ids that
  propagate via `X-Request-Id`, redacted credentials and tokens, rich error
  serializers). Every API error carries a machine-readable `code`
  (UNAUTHORIZED, FORBIDDEN, VALIDATION, RATE_LIMIT, NOT_FOUND, …) with a
  matching HTTP status, 5xx responses never leak internals, and uncaught
  exceptions / unhandled rejections are logged instead of dying silently.
  Feed, validation, permission and not-found failures are typed end-to-end.

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

## [0.6.9] - 2026-08-14

### Added

- **Full date in the header** — the toolbar now shows the complete date
  (e.g. "Friday, August 14, 2026") above the view title, so you always see
  exactly which day you're looking at.
- **Swipe navigation on the week view (touch)** — swipe left to move one week
  forward, swipe right to move one week back. Swipes starting on an event chip
  are left alone so drag-and-drop keeps working.
