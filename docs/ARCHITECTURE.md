# Architecture

## Process model

Standard Electron three-layer setup:

```
┌─────────────────────────────── Renderer (src/) ───────────────────────────────┐
│  React 19 + Zustand stores   →  window.calendarApi.*  (typed in preload.ts)  │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ contextBridge / ipcRenderer.invoke
┌───────────────────────────────────────┴───────────────────────────────────────┐
│  Preload (electron/preload.ts)                                                 │
│  Exposes a narrow, fully typed API surface — no Node APIs leak to the page.    │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
┌───────────────────────────────────────┴───────────────────────────────────────┐
│  Main process (electron/main.ts)                                               │
│  IPC handlers (auth, calendar, events, reminders, settings, import/export)     │
│  Reminder engine (30 s interval → OS notifications)                            │
│  Service layer: Auth, Calendar, Event, ICal                                     │
│  Storage: Drizzle (SQLite/PostgreSQL) + cache (Redis/In-memory)                │
└────────────────────────────────────────────────────────────────────────────────┘
```

`contextIsolation: true` and `nodeIntegration: false`. Every IPC handler that
touches data validates the session token via `withUser(token, (userId) => …)`
and authorizes per-calendar via `assertCanRead`/`assertCanWrite`.

## Storage abstraction

`shared/storage.ts` defines two interfaces:

- `EventStore` — calendars, events, exceptions, reminders, attendees, settings
- `AuthStore` — users, sessions, shares
- `EventCache` — `getEvents`/`setEvents`/`invalidateAll`/`publish`/`subscribe`

Implementations:

| Adapter | File | Activated by |
|---|---|---|
| `SqliteStore` | `electron/db/sqlite.ts` | default (embedded, zero config) |
| `PgStore` | `electron/db/pg.ts` | `CALENDAR_PG_URL` |
| `InMemoryCache` | `electron/db/cache-memory.ts` | default |
| `RedisCache` | `electron/db/cache-redis.ts` | `CALENDAR_REDIS_URL` |

The Drizzle schema in `shared/db-schema.ts` is shared by both SQL dialects, so
migrations and queries stay identical. PostgreSQL is preferred in production;
SQLite is the seamless fallback (unreachable PG falls back at boot).

The `EventCache` doubles as a pub/sub bus: `events.changed` messages let the
renderer (and future multi-window/plugin consumers) invalidate stale views.

## Services (main process)

- **AuthService** — register/login/logout, scrypt password hashing, session
  tokens (30-day TTL), calendar sharing with viewer/editor roles.
- **CalendarService** — calendar CRUD + visibility, share/unshare/list,
  `assertCanRead`/`assertCanWrite` permission checks.
- **EventService** — event CRUD with cache invalidation + pub/sub, global
  search, and the occurrence layer:
  - `listOccurrencesForRange` expands RRULE series into concrete occurrences
    with exceptions applied (what the views actually render)
  - `updateOccurrence`/`deleteOccurrence` upsert an `event_exceptions` row
  - `splitSeries` truncates the old series with `UNTIL` and creates a new one
- **ICalService** — .ics serialization/parsing (`electron/services/ical.ts`,
  RFC 5545 line folding + escaping, VALARM → reminders), JSON backup/restore.
  File access happens through native `dialog.showSaveDialog`/`showOpenDialog`.
- **Recurrence engine** (`electron/services/recurrence.ts`) — wraps `rrule`:
  `withDtstart()` embeds the DTSTART line (the library otherwise ignores the
  `dtstart` constructor option), `expandEvent()` applies exceptions
  (overrides + deletions) to occurrence streams.

## IPC surface (window.calendarApi)

```
auth:        register / login / logout / validate
calendars:   list / create / update / delete / share / unshare / shares
events:      list / get / create / update / delete / search / listOccurrences
             occurrences / updateOccurrence / deleteOccurrence / splitSeries
reminders:   create / delete
ical:        exportICal / importICal / exportJson / importJson
settings:    get / set   (per-user keys, prefixed `user:<id>:`)
app:         info (active storage backend)
```

All payloads are typed in `electron/preload.ts` (`CalendarApi` type) and
mirrored in `src/ipc.d.ts` for the renderer.

## Renderer state

- `src/store.ts` — `useAuth` (token/user), `useCalendar` (view, date,
  calendars, occurrences keyed by range, settings) and the **undo/redo
  history**.
- Undo/redo is action-based: every mutation pushes a `HistoryAction`
  (`create|update|delete|occurrence|split`) with `before`/`after` inputs.
  Undo applies the inverse (e.g. delete → recreate from snapshot, series
  split → delete new series + restore old RRULE). History is capped at 50
  entries and truncated on new actions.
- Occurrence-aware views: `EventOccurrence { event, exception, start, end,
  allDay, isException }` — drag & drop on recurring events automatically
  routes through `updateOccurrence`.

## Reminder engine

The main process polls `store.listDueReminders(now, 5min-window)` every 30 s,
shows an `electron.Notification` per due reminder, and marks it sent to avoid
duplicates. All-day events are excluded (they have no `startsAt`).

## Plugin readiness

The system is architected for the plugin system in FEATURES.md §4:

- Everything is behind interfaces (`EventStore`, `AuthStore`, `EventCache`)
- Services take dependencies via constructor injection
- The cache layer is already a pub/sub bus for hooking into event lifecycle
- IPC + preload provide a sandboxed bridge boundary — the same mechanism a
  plugin sandbox would use
- Schemas are extensible (`plugin_data` table reserved)
