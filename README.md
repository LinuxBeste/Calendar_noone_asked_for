# Calendar (no one asked for)

An offline-first desktop Google Calendar clone built with Electron, React, and TypeScript. Multi-user login, calendar sharing, recurring events with exception handling, reminders with system notifications, iCal import/export, and a plugin-ready architecture.

## Features

- **Views**: Day, Week, Month, Year, Agenda
- **Events**: create/edit/delete, drag & drop, resize, all-day & multi-day, overlap layout, per-event colors
- **Recurrence**: daily/weekly/monthly/yearly rules (RRULE), intervals, end dates, "this event / this and following / all events" edit modes, single-occurrence exceptions, series split
- **Calendars**: unlimited calendars, colors, show/hide, share with other users (viewer/editor roles)
- **Multi-user**: local accounts with scrypt password hashing, session tokens
- **Search**: global event search (`/` or `Ctrl+K`)
- **Reminders**: 5/10/30/60 min or 1 day before, delivered as OS notifications by the main process
- **Import/Export**: .ics import & export, full JSON backup/restore via native file dialogs
- **Undo/Redo**: global command history (`Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`), toolbar buttons
- **Settings**: week start, time format, default view, working hours, dark/auto mode (persisted per user)
- **Shortcuts**: `t` today, `d/w/m/y/a` views, context menus on events

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron 37 (context-isolated, no node integration in renderer) |
| UI | React 19 + TypeScript + Tailwind CSS + date-fns |
| State | Zustand |
| Storage | Drizzle ORM — SQLite (default, `better-sqlite3`) or PostgreSQL (`pg`) |
| Cache / pub-sub | Redis (`ioredis`) or in-memory fallback |
| Recurrence | `rrule` |
| Tests | Vitest |

## Getting started

Requires Node 20+ (developed on Node 26).

```bash
npm install
npm run dev
```

> On npm 12+, install scripts for native modules are blocked by default. If the
> install fails on `better-sqlite3`/`electron`, run:
> `npm install-scripts approve esbuild better-sqlite3 electron` and re-install.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Electron with hot reload |
| `npm run build` | Production build to `out/` |
| `npm start` | Run the built app |
| `npm run typecheck` | TypeScript check |
| `npm test` | Run unit tests (Vitest) |

## Configuration (environment variables)

The app runs fully offline with zero config (SQLite + in-memory cache).
Env vars are read from the shell or from a `.env` file in the project root
(see `.env.example`).

| Variable | Effect |
|---|---|
| `CALENDAR_PG_URL` | Use PostgreSQL instead of SQLite (e.g. `postgres://user:pass@localhost:5432/calendar`). Falls back to SQLite if unreachable. |
| `CALENDAR_REDIS_URL` | Use Redis for event caching + pub/sub (e.g. `redis://localhost:6379`). Falls back to in-memory. |

SQLite data lives in Electron's `userData` directory (`calendar.db`). A default calendar is created automatically on first run; register an account on the login screen to get started.

## Docker (optional backend)

The Electron app itself is a desktop GUI and cannot run in Docker, but its
optional storage backend (PostgreSQL + Redis) can:

```bash
cp .env.example .env     # optional: adjust credentials
docker compose up -d
npm run dev              # app now uses PostgreSQL + Redis automatically
```

- PostgreSQL listens on `localhost:5432`, Redis on `localhost:6379`
- Data persists in the `pgdata` / `redisdata` volumes; `docker compose down`
  stops the containers without deleting data
- If the containers aren't running, the app silently falls back to SQLite +
  in-memory cache

## Testing

```bash
npm test          # 34 unit tests across 4 suites
npm run typecheck
npm run build
```

- `tests/storage.test.ts` — SQLite store, cache, reminders
- `tests/auth.test.ts` — registration, login, sessions, sharing
- `tests/recurrence.test.ts` — RRULE expansion, exceptions
- `tests/ical.test.ts` — iCal round-trips (folding, escaping, all-day, recurrence)

## Project layout

```
electron/          Main process (Node)
  main.ts          Bootstrap, IPC handlers, reminder engine
  preload.ts       contextBridge API (window.calendarApi)
  db/              SqliteStore, PgStore, InMemoryCache, RedisCache
  services/        AuthService, CalendarService, EventService, ICalService, recurrence
shared/            Types + storage interfaces shared with the renderer
src/               Renderer (React)
  components/      AppShell, Toolbar, Sidebar, EventDialog, SearchBox, dialogs
  views/           Month/Week/Year/Agenda views
  store.ts         Zustand stores (auth, calendar, undo history)
  toasts.ts        Toast store
tests/             Vitest unit tests
FEATURES.md        Feature plan & roadmap (gitignored)
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the process model, IPC surface, storage adapters, and plugin readiness.

## Usage

A hands-on guide (creating events, recurrence modes, sharing, import/export,
shortcuts) lives in [docs/how-to-use.md](docs/how-to-use.md).

## Roadmap

The plugin system (manifests, hooks, sandboxed execution) is designed in
[FEATURES.md](FEATURES.md) section 4. Planned follow-ups: attendees/RSVP,
custom-range agenda, event templates, calendar groups, and collaboration/sync.
