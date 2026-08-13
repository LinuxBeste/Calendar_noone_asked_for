# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Fixed

- **Agenda view could freeze the whole tab** — `from`/`to` were recreated on
  every render, so the refresh effect re-ran after every event fetch, which
  updated the store, which re-rendered — an endless loop that locked up the
  renderer (Agenda view only; other views memoized their range). The range is
  now memoized like the other views.
- **Overlapping events stacked instead of side-by-side** — the week-view
  layout sweep stored each event's column group size in a copy, so earlier
  events never learned that the group had grown: with 3+ overlapping events
  the left one kept the 2-column width and the right ones overlapped. The
  sweep now updates the rendered entries directly.
- **Events from unchecked calendars still shown** — hiding a calendar only
  stopped fetching, so events already in the store kept appearing in every
  view. All views now filter by calendar visibility, and toggling a calendar
  refetches the current range.

### Changed

- **Product renamed to Calendar** — the app is now called "Calendar" in the
  UI, release notes, and package metadata (repo, image names, and previous
  releases keep their old names).


