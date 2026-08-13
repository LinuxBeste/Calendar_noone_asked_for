# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

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


