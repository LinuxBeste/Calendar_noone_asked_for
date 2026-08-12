# Calendar (no one asked for)

An offline-first desktop Google Calendar clone built with Electron, React, and TypeScript. Multi-user login, calendar sharing, recurring events with exception handling, reminders with system notifications, iCal import/export, and a plugin-ready architecture.

## Features

- **Views**: Day, Week, Month, Year, Agenda
- **Events**: create/edit/delete, drag & drop, resize, all-day & multi-day, overlap layout, per-event colors, drag-to-create (drag on the grid to draft an event), event templates
- **Recurrence**: daily/weekly/monthly/yearly rules (RRULE), intervals, end dates, "this event / this and following / all events" edit modes, single-occurrence exceptions, series split
- **Calendars**: unlimited calendars, colors, show/hide, share with other users (viewer/editor roles)
- **Live sync**: WebSocket push so all clients update instantly, filtered per user/calendar
- **Upcoming-event notifications**: notify before events (configurable window), besides the classic reminders — native on desktop/Android, JS engine in the browser
- **QR share links**: show a QR code for a calendar's public link to open on your phone
- **Settings**: 124 settings across 10 categories (views, appearance, agenda, month, events, notifications, privacy, …) with a shared server-validated catalog
- **Multi-user**: local accounts with scrypt password hashing, session tokens
- **ICS feeds**: subscribe to external .ics URLs; events sync automatically and are read-only
- **Share by link**: public read-only links per calendar (view page + .ics URL, no account needed); subscribe to other people's links from the sidebar
- **Search**: global event search (`/` or `Ctrl+K`)
- **Reminders**: 5/10/30/60 min or 1 day before, delivered as OS notifications — the desktop app keeps running in the tray when the window is closed, so reminders still fire
- **Import/Export**: .ics import & export, full JSON backup/restore via native file dialogs
- **Undo/Redo**: global command history (`Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`), toolbar buttons
- **Maintenance**: server-side trash auto-purge and daily SQLite backups with rotation
- **Shortcuts**: `t` today, `d/w/m/y/a` views, `j/k` navigate, `n`/`q` quick add, `?` help, context menus on events

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

`better-sqlite3` is a native module and is ABI-specific — it must be built for
the runtime it runs in:

| Runtime | Command |
|---|---|
| Electron (the app) | `npm run rebuild:electron` |
| Node (vitest unit tests) | `npm run rebuild:node` |

After a fresh `npm install` you usually only need `npm run rebuild:electron`
before `npm run dev` (the binary ships built for Node by default, which keeps
`npm test` working out of the box).

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
| `CALENDAR_API_KEY` | API key for system calls (reminder poller sends `X-Api-Key`). Without it, `/reminders/due` and `/reminders/:id/sent` only work with a user token. |
| `CALENDAR_CORS_ORIGINS` | Comma-separated CORS allowlist for the web client (default: `http://localhost:5173, http://127.0.0.1:5173, https://localhost`). |
| `CALENDAR_PORT` / `CALENDAR_HOST` | Backend listen port (default `3001`) and host (default `0.0.0.0`). |
| `CALENDAR_TRASH_DAYS` | Purge trashed events older than this many days (default `30`). |
| `CALENDAR_BACKUPS_DIR` | Where daily SQLite backups are written (default `<data dir>/backups`). |
| `CALENDAR_BACKUP_KEEP` | Number of backups to keep (default `14`). |
| `CALENDAR_FEED_INTERVAL_MIN` | How often ICS feeds are re-fetched (default `15`). |

SQLite data lives in Electron's `userData` directory (`calendar.db`). A default calendar is created automatically on first run and assigned to the first account that registers or logs in.

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

## Web & Android clients

The standalone backend (`npm run server`) serves the full-featured web client at
`http://localhost:3001/` — the same renderer code as the desktop app, talking to
the backend over HTTP (login, all views, editing, search, undo, sharing,
import/export, settings). If the backend is unreachable, a connection screen
lets you enter the server URL (stored in `localStorage`).

The Android app is the same web client wrapped in Capacitor, with mobile
extras: touch drag & drop (drag-to-create via long-press, move/resize events),
native notifications for reminders (works while the app is in the background),
a native share sheet for public calendar links, a hardware back button (closes
dialogs → previous view → minimize), and a responsive layout from phones to
tablets to desktops.

```bash
npm run build:android     # builds web client + syncs into the Android project
npm run android:run       # …then opens Android Studio (needs the Android SDK + JDK)
```

Point the app at your backend (`http://10.0.2.2:3001` is the default on the
Android emulator, or enter your computer's LAN IP from a device — the
connection screen and Settings → API URL both work). Cleartext HTTP is enabled
for local backends.

### Live demo (no backend needed)

https://linuxbeste.github.io/Calendar_noone_asked_for/ runs the web client in
a browser-only demo mode: seeded calendars and events, no login, everything
resets on reload. The web client is also a PWA — install it and it works
offline once loaded. The sidebar share dialog shows QR codes for public links
("Scan to open on your phone").

```bash
npm run build:demo   # demo build to web/dist-demo/ (what the demo pages host)
```

Installers for every platform always point to the latest release:
https://linuxbeste.github.io/Calendar_noone_asked_for/downloads.html

## Testing

```bash
npm test          # 51 unit tests across 6 suites
npm run typecheck
npm run build
```

- `tests/storage.test.ts` — SQLite store, cache, reminders
- `tests/auth.test.ts` — registration, login, sessions, sharing
- `tests/recurrence.test.ts` — RRULE expansion, exceptions
- `tests/ical.test.ts` — iCal round-trips (folding, escaping, all-day, recurrence)
- `tests/validation.test.ts` — settings/input validation
- `tests/client-utils.test.ts` — quick-add parser, event templates

## Project layout

```
electron/          Main process (Node)
  main.ts          Bootstrap, IPC handlers, tray, reminder engine
  preload.ts       contextBridge API (window.calendarApi)
  api-client.ts    HTTP client for the backend
server/            Standalone Fastify backend
  db/              SqliteStore, PgStore, InMemoryCache, RedisCache
  services/        Auth, Calendar, Event, ICal, Feed, Link services, ws-hub, recurrence
shared/            Types + settings catalog shared with the renderer
src/               Renderer (React)
  components/      AppShell, Toolbar, Sidebar, EventDialog, SearchBox, dialogs
  views/           Month/Week/Year/Agenda views
  store.ts         Zustand stores (auth, calendar, undo history)
  toasts.ts        Toast store
web/               Web + Android client (same renderer, HTTP adapter in api.ts)
android/           Capacitor Android project
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
calendar groups, offline caching, and collaboration/sync for the web client.
