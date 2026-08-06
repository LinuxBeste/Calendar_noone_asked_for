# How to use

## First start

1. `npm install` and `npm run dev` (see README for the npm 12 install-scripts note).
2. On the login screen, pick **Register** and create an account (email, name, password).
   Passwords are hashed with scrypt; everything is stored locally on your machine.
3. A default calendar ("My calendar") is created automatically. You stay logged in
   until you sign out (session token stored locally, 30-day lifetime).

## Navigating

| Action | How |
|---|---|
| Switch view | Toolbar: Day / Week / Month / Year / Agenda, or keys `d` `w` `m` `y` `a` |
| Move through time | `‹` / `›` buttons (period depends on view), or Today to jump back |
| Jump to a date | Click a date in the mini calendar in the sidebar |
| Today | `t` key or the Today button |

## Creating events

- **+ Create button** (sidebar): opens the event dialog, pre-filled with the
  currently selected date and 09:00 (or the default duration from settings).
- **Click on the grid**: in Day/Week view, click any empty time slot — an event
  is created at that exact time.
- **Right-click on the grid**: "New event" at the clicked time.
- **Drag on the grid**: press and drag across a time range in Day/Week view to
  create an event spanning that range.
- In the dialog you can set: title, calendar, all-day toggle, start/end
  date+time, location, description, color, busy/free, reminder, and repeat.

## Editing & deleting events

- Click any event chip to open the dialog.
- **Resize**: hover an event in Day/Week view and drag the bottom edge
  (snaps to 15-minute steps).
- **Move**: drag the event to another time/day (Day/Week/Month views).
- **Delete**: Delete button in the dialog, or right-click → Delete.
- **Context menu**: right-click an event for quick Edit/Delete.
- All changes can be undone with `Ctrl+Z`.

## Recurring events (repeat)

1. Open the event dialog and set **Repeat**: daily, weekly, monthly, yearly,
   with a custom interval (every N) and optional end date.
2. Clicking any occurrence of a series lets you choose what to edit:

   | Mode | What happens |
   |---|---|
   | **This event** | Only that occurrence changes (stored as an exception) |
   | **This and following** | The series is split — earlier events keep the old rule |
   | **All events** | The whole series is edited |

3. The same three-way choice applies to Delete.
4. Dragging/moving a single occurrence of a series automatically creates an
   exception (the rest of the series stays untouched).

## Calendars

- **Create**: "+ Create" in the sidebar (name + color).
- **Show/hide**: checkbox next to each calendar. Hidden calendars disappear
  from views, search and reminders.
- **Share**: hover a calendar and click the person icon → enter another user's
  email and pick **Viewer** (read-only) or **Editor** (can create/edit events).
  The other user sees the calendar in their sidebar after logging in.
  Shared calendars can be hidden by the recipient just like their own.

## Search

- Click the search box (or press `/` or `Ctrl+K`).
- Results update as you type (debounced); click a result to jump to that event
  in Day view. Search covers title, description and location.

## Reminders

- In the event dialog, pick a reminder (5 min – 1 day before; not available for
  all-day events).
- The app checks every 30 seconds and shows a **system notification** when a
  reminder is due. Each reminder fires once.

## Import / Export

Sidebar → **Import / Export**:

| Button | What it does |
|---|---|
| Import .ics | Pick an `.ics` file → events are imported into the selected calendar (recurrence rules and reminders included) |
| Import backup | Restore a full JSON backup (creates calendars + events) |
| Export .ics | Save all your events as `.ics` via a native save dialog |
| Export backup | Save the complete JSON backup (calendars + events) |

## Undo / Redo

- `Ctrl+Z` undoes, `Ctrl+Shift+Z` (or `Ctrl+Y`) redoes.
- Toolbar buttons (arrows left of Today) do the same.
- Covers event create/edit/delete, drag & drop, resizing, occurrence edits and
  series splits. History is capped at the last 50 actions.

## Settings

Gear icon (top right) → Settings. Changes are saved per user:

- Week starts on Monday/Sunday
- Time format 24h or 12h
- Default view on startup
- Working hours (start/end, used by future views)
- Appearance: Light / Dark / Auto (follows the OS theme)
- Show week numbers in Month view

## Keyboard shortcuts

| Key | Action |
|---|---|
| `t` | Go to today |
| `d` / `w` / `m` / `y` / `a` | Day / Week / Month / Year / Agenda view |
| `/` or `Ctrl+K` | Focus search |
| `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) | Undo / Redo |
| `Esc` | Close dialogs/menus |

## Storage & multiple users

- Data lives in Electron's `userData` directory (`calendar.db` by default).
- Each account is isolated: you only see your own calendars plus calendars
  shared with you. The same app instance can hold any number of accounts —
  sign out and register/login another.
- Optional PostgreSQL (`CALENDAR_PG_URL`) and Redis (`CALENDAR_REDIS_URL`)
  replace the embedded storage and cache; see README. If PostgreSQL is
  configured but unreachable, the app falls back to SQLite automatically.
