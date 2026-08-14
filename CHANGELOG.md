# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

## [0.6.10] - 2026-08-14

### Added

- **Swipe navigation on the month view (touch)** — swipe left/right to move between months.
- **Polished motion everywhere** — toasts, the mobile sidebar, context menus and dialog backdrops animate in; the header date fades on navigation.

### Changed

- **Structured server logging & typed API errors** — pino logging (level, pretty and file output configurable via `CALENDAR_LOG_LEVEL`/`CALENDAR_LOG_PRETTY`/`CALENDAR_LOG_FILE`, request ids via `X-Request-Id`, token/credential redaction). Every API error carries a machine-readable `code` with a matching HTTP status; 5xx responses never leak internals.
- **Request correlation & audit logging** — `userId`/`email` on every log line; auth, share, rate-limit, feed-sync and WebSocket events are logged; slow requests warn beyond `CALENDAR_SLOW_MS`; unknown routes reply with a typed 404.
- **Server hardening** — 20 MB body cap, 30 s request timeout, CORS rejections return 403, startup logs the effective configuration.
- **Client-side error UX** — backend errors keep their `code`/`details` into the UI and map to friendly, actionable messages; server validation details show as per-field hints; error toasts are consistent across the app; the error boundary gains "Try again".
- **Request timeout on the desktop client** — API calls abort after 30 s and surface as "server unreachable"; network failures trigger the offline banner.

### Fixed

- **Calendar leak via the API** — event queries are scoped server-side to calendars the user can read; shared-calendar iCal export works again.
- **Share links not owner-only** — listing and deleting links now require ownership.
- **Calendar feed SSRF** — feeds block private/local hosts, non-http(s) URLs, bodies over 2 MB and more than 5 redirects; feeds already syncing are skipped.
- **Tokens leaked into server logs** — `token=` parameters and `/public/…` share URLs are redacted.
- **"Split series" phantom event** — now throws a clear error; occurrence matching is UTC-based.
- **iCal timezone bugs** — timed events export as UTC; all-day `DTEND` is spec-compliant, including DST boundary days.
- **iCal/JSON import could crash the server** — uploads are validated per item.
- **Event resize spammed the API** — now commits once on release; multi-day timed events no longer render twice.
- **Week-view drag-and-drop wrong minute** — drops now use the grid cell instead of the header.
- **Click-to-create ignored the clicked time** — the clicked time is pre-filled.
- **Sunday-start header misalignment** — month and year view headers rotate correctly.
- **Year view jumped to January** — clicking a month now opens that month.
- **Mini-calendar dots off by a day** — occurrence dates use the local date.
- **Find free time showed false slots** — fetches the requested range and blocks all recurring occurrences.
- **Stale data overwriting fresh data** — out-of-date refresh responses are discarded.
- **Offline queue could stall** — permanently failing operations are dropped with a toast.
- **Deleting an event gave no failure feedback** — confirm dialogs now show the error.
- **Redis cache could crash the server** — ioredis errors are handled; `SCAN` replaces blocking `KEYS`; the in-memory fallback is capped.
- **Reminder scans loaded every event** — queries now filter in SQL with an index.
- **PostgreSQL fallback leaked connections** — the pool is closed before falling back to SQLite.
- **Server shutdown was abrupt** — SIGTERM/SIGINT stop intervals, HTTP, cache and database cleanly.
