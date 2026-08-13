# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project keeps a rolling
`unreleased` section for current work. Released versions older than the
latest one are archived in [CHANGELOG.archive.md](./CHANGELOG.archive.md).

## [Unreleased]

### Fixed

- **Overlapping events stacked instead of side-by-side** — the week-view
  layout sweep stored each event's column group size in a copy, so earlier
  events never learned that the group had grown: with 3+ overlapping events
  the left one kept the 2-column width and the right ones overlapped. The
  sweep now updates the rendered entries directly.


