/** Declarative settings catalog — single source of truth for the client UI, defaults and server validation. */

export type SettingCategoryId = 'general' | 'appearance' | 'views' | 'month' | 'agenda' | 'events' | 'notifications' | 'language' | 'privacy' | 'advanced' | 'plugins'

export interface SettingOption {
  value: string
  label: string
}

export interface SettingDef {
  key: string
  label: string
  hint?: string
  category: SettingCategoryId
  type: 'boolean' | 'number' | 'select' | 'color' | 'text'
  min?: number
  max?: number
  step?: number
  options?: SettingOption[]
  /** Fill options dynamically (client-side): timezone list, holiday regions, user calendars, accent presets. */
  dynamic?: 'timezones' | 'holidays' | 'calendars' | 'accent'
  /** Only show this setting when another setting has the given value. */
  showWhen?: { key: string; value: string }
  defaultValue: string | number | boolean
}

export const SETTING_CATEGORIES: { id: SettingCategoryId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'views', label: 'Week & Day' },
  { id: 'month', label: 'Month' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'events', label: 'Events' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'language', label: 'Language & Region' },
  { id: 'privacy', label: 'Privacy & Sharing' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'plugins', label: 'Plugins' }
]

export const SETTING_DEFS: SettingDef[] = [
  // ---- General ----
  { key: 'defaultView', label: 'Startup view', hint: 'Shown when the app starts and on "Today"', category: 'general', type: 'select', options: [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
    { value: 'agenda', label: 'Agenda' },
    { value: 'split', label: 'Month + Agenda' }
  ], defaultValue: 'week' },
  { key: 'firstDayOfWeek', label: 'Week starts on', hint: 'First day of the week in all views', category: 'general', type: 'select', options: [
    { value: '1', label: 'Monday' },
    { value: '0', label: 'Sunday' }
  ], defaultValue: 1 },
  { key: 'language', label: 'Language', hint: 'Used for date formatting (UI text is English for now)', category: 'general', type: 'select', options: [
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
    { value: 'it', label: 'Italiano' },
    { value: 'nl', label: 'Nederlands' },
    { value: 'pl', label: 'Polski' },
    { value: 'sv', label: 'Svenska' },
    { value: 'ja', label: '日本語' },
    { value: 'zh', label: '中文' }
  ], defaultValue: 'en' },
  { key: 'confirmBeforeDelete', label: 'Confirm before deleting', hint: 'Ask before events are deleted', category: 'general', type: 'boolean', defaultValue: true },
  { key: 'closeOnEscape', label: 'Close dialogs with Esc', category: 'general', type: 'boolean', defaultValue: true },
  { key: 'showEventTooltips', label: 'Show event tooltips', hint: 'Title tooltip when hovering events', category: 'general', type: 'boolean', defaultValue: true },
  { key: 'reduceMotion', label: 'Reduce motion', hint: 'Disable animated transitions', category: 'general', type: 'boolean', defaultValue: false },
  { key: 'startInFullscreen', label: 'Start in fullscreen', hint: 'Desktop app opens maximized', category: 'general', type: 'boolean', defaultValue: false },
  { key: 'autoStartWithSystem', label: 'Start with system', hint: 'Desktop app launches on login', category: 'general', type: 'boolean', defaultValue: false },

  // ---- Appearance ----
  { key: 'darkMode', label: 'Theme', hint: 'Auto follows your operating system; Scheduled switches at fixed hours', category: 'appearance', type: 'select', options: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Auto' },
    { value: 'scheduled', label: 'Scheduled' }
  ], defaultValue: 'light' },
  { key: 'darkModeStart', label: 'Dark mode starts at', hint: 'Hour of the day, 0 = midnight. Equal start and end = always dark', category: 'appearance', type: 'number', min: 0, max: 23, defaultValue: 22, showWhen: { key: 'darkMode', value: 'scheduled' } },
  { key: 'darkModeEnd', label: 'Dark mode ends at', category: 'appearance', type: 'number', min: 0, max: 23, defaultValue: 7, showWhen: { key: 'darkMode', value: 'scheduled' } },
  { key: 'accentColor', label: 'Accent color', hint: 'Used for buttons, highlights and today', category: 'appearance', type: 'color', dynamic: 'accent', defaultValue: '#1a73e8' },
  { key: 'accentFollowsCalendar', label: 'Accent follows calendar', hint: 'The UI accent takes this calendar’s color (empty = accent color)', category: 'appearance', type: 'select', dynamic: 'calendars', defaultValue: '' },
  { key: 'secondaryTimezone', label: 'Secondary timezone', hint: 'Shown next to event times (empty = off)', category: 'appearance', type: 'select', dynamic: 'timezones', defaultValue: '' },
  { key: 'fontScale', label: 'Interface font size', hint: 'Applies to the whole interface (%)', category: 'appearance', type: 'number', min: 80, max: 130, step: 5, defaultValue: 100 },
  { key: 'density', label: 'Density', hint: 'Spacing between list items', category: 'appearance', type: 'select', options: [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' }
  ], defaultValue: 'comfortable' },
  { key: 'eventCornerRadius', label: 'Event corner radius', category: 'appearance', type: 'select', options: [
    { value: 'none', label: 'None' },
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' }
  ], defaultValue: 'medium' },
  { key: 'eventOpacity', label: 'Event opacity (%)', category: 'appearance', type: 'number', min: 60, max: 100, step: 5, defaultValue: 100 },
  { key: 'eventBorderStyle', label: 'Event border style', category: 'appearance', type: 'select', options: [
    { value: 'solid', label: 'Solid' },
    { value: 'left', label: 'Left accent' },
    { value: 'none', label: 'None' }
  ], defaultValue: 'solid' },
  { key: 'highlightToday', label: 'Highlight today', hint: 'Stronger highlight for the current day', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'showNowLine', label: 'Show current-time line', hint: 'Red line in day/week views', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'weekendShading', label: 'Shade weekends', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'holidayShading', label: 'Shade holidays', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'showCalendarColors', label: 'Use calendar colors', hint: 'Events take their calendar color', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'animateTransitions', label: 'Animate transitions', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'compactSidebar', label: 'Compact icon sidebar', hint: 'Slim sidebar on the left edge', category: 'appearance', type: 'boolean', defaultValue: true },
  { key: 'showHoverPreview', label: 'Preview on hover', hint: 'Quick event info when hovering', category: 'appearance', type: 'boolean', defaultValue: true },

  // ---- Week & Day ----
  { key: 'workingHoursStart', label: 'Working hours start', hint: 'Your typical working window', category: 'views', type: 'number', min: 0, max: 23, defaultValue: 9 },
  { key: 'workingHoursEnd', label: 'Working hours end', category: 'views', type: 'number', min: 1, max: 24, defaultValue: 17 },
  { key: 'hideWeekends', label: 'Hide weekends', hint: 'Show a 5-day week in Week view', category: 'views', type: 'boolean', defaultValue: false },
  { key: 'showWeekNumbers', label: 'Show week numbers', hint: 'In week headers', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'scrollToWorkingHours', label: 'Scroll to working hours', hint: 'On opening day/week view', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'fitDayToScreen', label: 'Fit day to screen', hint: 'Zoom out if the day is taller than the window', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'defaultZoomPct', label: 'Default zoom (%)', hint: 'Time scale when opening day/week view', category: 'views', type: 'number', min: 50, max: 300, step: 10, defaultValue: 100 },
  { key: 'snapInterval', label: 'Snap interval', hint: 'Grid click & drag snapping (minutes)', category: 'views', type: 'select', options: [
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '60', label: '60 minutes' }
  ], defaultValue: 15 },
  { key: 'showQuarterLines', label: 'Show quarter-hour lines', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'hourLineStyle', label: 'Hour line style', category: 'views', type: 'select', options: [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' }
  ], defaultValue: 'solid' },
  { key: 'dayColumnMinWidth', label: 'Day column width (px)', hint: 'Minimum width of each day column', category: 'views', type: 'number', min: 80, max: 240, step: 10, defaultValue: 120 },
  { key: 'showDayHeaders', label: 'Show day headers', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'showAllDayRow', label: 'Show all-day row', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'timeGutterWidth', label: 'Time gutter width', category: 'views', type: 'select', options: [
    { value: 'narrow', label: 'Narrow' },
    { value: 'medium', label: 'Medium' },
    { value: 'wide', label: 'Wide' }
  ], defaultValue: 'medium' },
  { key: 'showEndTimesInWeek', label: 'Show end times on events', category: 'views', type: 'boolean', defaultValue: true },
  { key: 'alternateHourShading', label: 'Shade alternate hours', category: 'views', type: 'boolean', defaultValue: false },

  // ---- Month ----
  { key: 'monthMaxEvents', label: 'Events per cell', hint: 'Max events shown before "+n more"', category: 'month', type: 'number', min: 1, max: 10, defaultValue: 3 },
  { key: 'monthShowHolidays', label: 'Show holidays in month view', category: 'month', type: 'boolean', defaultValue: false },
  { key: 'monthShowWeekNumbers', label: 'Show week numbers', category: 'month', type: 'boolean', defaultValue: true },
  { key: 'monthWeekendShading', label: 'Shade weekends', category: 'month', type: 'boolean', defaultValue: true },
  { key: 'monthTrailingDays', label: 'Show trailing days', hint: 'Days from adjacent months', category: 'month', type: 'boolean', defaultValue: true },
  { key: 'monthEventStyle', label: 'Event style', category: 'month', type: 'select', options: [
    { value: 'bar', label: 'Bar' },
    { value: 'dot', label: 'Dot' },
    { value: 'compact', label: 'Compact' }
  ], defaultValue: 'bar' },
  { key: 'monthTodayRing', label: 'Ring around today', category: 'month', type: 'boolean', defaultValue: true },
  { key: 'monthDragDrop', label: 'Drag & drop between days', category: 'month', type: 'boolean', defaultValue: true },
  { key: 'monthHoverPreview', label: 'Preview on hover', category: 'month', type: 'boolean', defaultValue: true },
  { key: 'monthCompactWeekends', label: 'Compact weekend cells', category: 'month', type: 'boolean', defaultValue: false },
  { key: 'monthShowEventTime', label: 'Show event times', category: 'month', type: 'boolean', defaultValue: true },

  // ---- Agenda ----
  { key: 'agendaRangeDays', label: 'Agenda range (days)', hint: 'How far ahead the agenda lists', category: 'agenda', type: 'number', min: 1, max: 90, defaultValue: 14 },
  { key: 'agendaShowTime', label: 'Show times', category: 'agenda', type: 'boolean', defaultValue: true },
  { key: 'agendaShowLocation', label: 'Show locations', category: 'agenda', type: 'boolean', defaultValue: true },
  { key: 'agendaShowIcons', label: 'Show event icons', category: 'agenda', type: 'boolean', defaultValue: true },
  { key: 'agendaGroupBy', label: 'Group by', category: 'agenda', type: 'select', options: [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'none', label: 'None (flat)' }
  ], defaultValue: 'day' },
  { key: 'agendaSortOrder', label: 'Sort order', category: 'agenda', type: 'select', options: [
    { value: 'chronological', label: 'Chronological' },
    { value: 'reversed', label: 'Newest first' }
  ], defaultValue: 'chronological' },
  { key: 'agendaCollapsePast', label: 'Collapse past days', category: 'agenda', type: 'boolean', defaultValue: true },
  { key: 'agendaShowHolidays', label: 'Show holidays', category: 'agenda', type: 'boolean', defaultValue: false },
  { key: 'agendaShowEndTime', label: 'Show end times', category: 'agenda', type: 'boolean', defaultValue: true },
  { key: 'agendaMaxItemsPerDay', label: 'Max items per day', category: 'agenda', type: 'number', min: 5, max: 50, defaultValue: 20 },
  { key: 'agendaShowWeekdayHeader', label: 'Show weekday headers', category: 'agenda', type: 'boolean', defaultValue: true },

  // ---- Events ----
  { key: 'defaultEventDuration', label: 'Default duration (min)', hint: 'Pre-fills the end time of new events', category: 'events', type: 'number', min: 5, max: 1440, step: 5, defaultValue: 30 },
  { key: 'defaultReminderMinutes', label: 'Default reminder', hint: 'Pre-selects the reminder for new events', category: 'events', type: 'select', options: [
    { value: '0', label: 'No reminder' },
    { value: '5', label: '5 minutes before' },
    { value: '10', label: '10 minutes before' },
    { value: '30', label: '30 minutes before' },
    { value: '60', label: '1 hour before' },
    { value: '1440', label: '1 day before' }
  ], defaultValue: 0 },
  { key: 'defaultCalendarId', label: 'Default calendar', hint: 'Where new events are created', category: 'events', type: 'select', dynamic: 'calendars', defaultValue: '' },
  { key: 'defaultBusy', label: 'Default availability', category: 'events', type: 'select', options: [
    { value: 'busy', label: 'Busy' },
    { value: 'free', label: 'Free' }
  ], defaultValue: 'busy' },
  { key: 'defaultAllDay', label: 'New events are all-day', category: 'events', type: 'boolean', defaultValue: false },
  { key: 'defaultColor', label: 'Default event color', hint: 'Hex like #ff8800, empty = calendar color', category: 'events', type: 'text', defaultValue: '' },
  { key: 'showEndTimeOnEvent', label: 'Show end time on events', category: 'events', type: 'boolean', defaultValue: true },
  { key: 'dragAndDropEnabled', label: 'Drag & drop events', category: 'events', type: 'boolean', defaultValue: true },
  { key: 'resizeEnabled', label: 'Resize events by dragging', category: 'events', type: 'boolean', defaultValue: true },
  { key: 'deleteToTrash', label: 'Delete moves to trash', hint: 'Recoverable instead of permanent', category: 'events', type: 'boolean', defaultValue: true },
  { key: 'duplicateKeepsRecurrence', label: 'Duplicates keep recurrence', category: 'events', type: 'boolean', defaultValue: true },
  { key: 'autoTitleCase', label: 'Auto-capitalize titles', category: 'events', type: 'boolean', defaultValue: false },
  { key: 'showFreeBusyStyle', label: 'Style free events specially', category: 'events', type: 'boolean', defaultValue: true },
  { key: 'newEventsUseSnap', label: 'Snap new events to grid', category: 'events', type: 'boolean', defaultValue: true },

  // ---- Notifications ----
  { key: 'notificationsEnabled', label: 'Notifications enabled', category: 'notifications', type: 'boolean', defaultValue: true },
  { key: 'notifySound', label: 'Play notification sound', category: 'notifications', type: 'boolean', defaultValue: true },
  { key: 'notifySnoozeMinutes', label: 'Snooze length (min)', category: 'notifications', type: 'number', min: 1, max: 60, defaultValue: 10 },
  { key: 'badgeTodayCount', label: 'Badge with today count', hint: 'Taskbar/dock badge', category: 'notifications', type: 'boolean', defaultValue: true },
  { key: 'notifyUpcomingEvents', label: 'Notify before upcoming events', category: 'notifications', type: 'boolean', defaultValue: false },
  { key: 'notifyUpcomingWindow', label: 'Upcoming notice (min before)', category: 'notifications', type: 'number', min: 5, max: 120, step: 5, defaultValue: 30 },
  { key: 'notifyWhenFocused', label: 'Notify while app is focused', category: 'notifications', type: 'boolean', defaultValue: false },
  { key: 'notificationSoundType', label: 'Sound type', category: 'notifications', type: 'select', options: [
    { value: 'default', label: 'Default' },
    { value: 'bell', label: 'Bell' },
    { value: 'chime', label: 'Chime' },
    { value: 'echo', label: 'Echo' }
  ], defaultValue: 'default' },
  { key: 'silentHoursEnabled', label: 'Silent hours', hint: 'No notifications during this window', category: 'notifications', type: 'boolean', defaultValue: false },
  { key: 'silentHoursStart', label: 'Silent hours start', category: 'notifications', type: 'number', min: 0, max: 23, defaultValue: 22 },
  { key: 'silentHoursEnd', label: 'Silent hours end', category: 'notifications', type: 'number', min: 0, max: 23, defaultValue: 7 },
  { key: 'weeklyDigest', label: 'Weekly digest', hint: 'Summary of the week ahead', category: 'notifications', type: 'boolean', defaultValue: false },
  { key: 'digestDay', label: 'Digest day', hint: '0 = Sunday', category: 'notifications', type: 'number', min: 0, max: 6, defaultValue: 1 },
  { key: 'digestTime', label: 'Digest time (hour)', category: 'notifications', type: 'number', min: 0, max: 23, defaultValue: 8 },

  // ---- Language & Region ----
  { key: 'timeFormat', label: 'Time format', hint: 'How times are displayed', category: 'language', type: 'select', options: [
    { value: '24h', label: '24-hour' },
    { value: '12h', label: '12-hour (am/pm)' }
  ], defaultValue: '24h' },
  { key: 'timezone', label: 'Timezone', hint: 'Used to interpret event times', category: 'language', type: 'select', dynamic: 'timezones', defaultValue: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { key: 'showHolidays', label: 'Show holidays', hint: 'Public holidays in week and month view', category: 'language', type: 'boolean', defaultValue: false },
  { key: 'holidaysCountry', label: 'Holiday region', category: 'language', type: 'select', dynamic: 'holidays', defaultValue: 'de' },
  { key: 'dateStyle', label: 'Date style', hint: 'Format of dates in headers', category: 'language', type: 'select', options: [
    { value: 'short', label: 'Short (1/5/26)' },
    { value: 'medium', label: 'Medium (Jan 5)' },
    { value: 'long', label: 'Long (January 5)' },
    { value: 'full', label: 'Full (Mon, Jan 5)' }
  ], defaultValue: 'medium' },
  { key: 'timeStyle', label: 'Time style', category: 'language', type: 'select', options: [
    { value: 'HH:mm', label: 'HH:mm' },
    { value: 'HH:mm:ss', label: 'HH:mm:ss' },
    { value: 'h:mm a', label: '12-hour' }
  ], defaultValue: 'HH:mm' },
  { key: 'weekNumberStyle', label: 'Week number style', category: 'language', type: 'select', options: [
    { value: 'iso', label: 'ISO (Mon-start)' },
    { value: 'us', label: 'US (Sun-start)' }
  ], defaultValue: 'iso' },
  { key: 'timezoneDisplay', label: 'Timezone display', hint: 'In event previews', category: 'language', type: 'select', options: [
    { value: 'name', label: 'Name (Europe/Berlin)' },
    { value: 'offset', label: 'Offset (UTC+1)' },
    { value: 'none', label: 'Hidden' }
  ], defaultValue: 'name' },
  { key: 'holidayLabelStyle', label: 'Holiday label style', category: 'language', type: 'select', options: [
    { value: 'short', label: 'Short' },
    { value: 'long', label: 'Long' }
  ], defaultValue: 'short' },
  { key: 'monthNamesStyle', label: 'Month names', category: 'language', type: 'select', options: [
    { value: 'short', label: 'Short (Jan)' },
    { value: 'long', label: 'Long (January)' }
  ], defaultValue: 'short' },
  { key: 'weekdayNamesStyle', label: 'Weekday names', category: 'language', type: 'select', options: [
    { value: 'short', label: 'Short (Mon)' },
    { value: 'long', label: 'Long (Monday)' }
  ], defaultValue: 'short' },

  // ---- Privacy & Sharing ----
  { key: 'shareAllowed', label: 'Allow sharing calendars', category: 'privacy', type: 'boolean', defaultValue: true },
  { key: 'defaultShareRole', label: 'Default share role', category: 'privacy', type: 'select', options: [
    { value: 'viewer', label: 'Viewer (read-only)' },
    { value: 'editor', label: 'Editor (can change)' }
  ], defaultValue: 'viewer' },
  { key: 'allowPublicCalendars', label: 'Allow public calendars', category: 'privacy', type: 'boolean', defaultValue: false },
  { key: 'showOwnerNames', label: 'Show owner names', hint: 'For shared calendars', category: 'privacy', type: 'boolean', defaultValue: true },
  { key: 'showSharedBadges', label: 'Show shared badges', category: 'privacy', type: 'boolean', defaultValue: true },
  { key: 'hideDetailsFromViewers', label: 'Hide details from viewers', hint: 'Descriptions & locations hidden for viewer role', category: 'privacy', type: 'boolean', defaultValue: false },
  { key: 'searchIncludesShared', label: 'Search includes shared calendars', category: 'privacy', type: 'boolean', defaultValue: true },
  { key: 'showForeignCalendarColors', label: "Show other calendars' colors", category: 'privacy', type: 'boolean', defaultValue: true },
  { key: 'activityNotifications', label: 'Notify on shared calendar changes', category: 'privacy', type: 'boolean', defaultValue: true },

  // ---- Advanced ----
  { key: 'autoRefreshMinutes', label: 'Auto-refresh (min)', hint: '0 = off', category: 'advanced', type: 'number', min: 0, max: 60, defaultValue: 0 },
  { key: 'apiTimeoutMs', label: 'API timeout (ms)', category: 'advanced', type: 'number', min: 5000, max: 60000, step: 1000, defaultValue: 30000 },
  { key: 'keepTrashDays', label: 'Keep trash (days)', hint: '0 = keep forever', category: 'advanced', type: 'number', min: 0, max: 90, defaultValue: 30 },
  { key: 'historyLimit', label: 'Undo history size', category: 'advanced', type: 'number', min: 10, max: 200, step: 10, defaultValue: 50 },
  { key: 'enableKeyboardShortcuts', label: 'Keyboard shortcuts', category: 'advanced', type: 'boolean', defaultValue: true },
  { key: 'enableCommandPalette', label: 'Command palette', category: 'advanced', type: 'boolean', defaultValue: true },
  { key: 'debugLogging', label: 'Debug logging', category: 'advanced', type: 'boolean', defaultValue: false },
  { key: 'telemetryOff', label: 'No anonymous statistics', category: 'advanced', type: 'boolean', defaultValue: true },
  { key: 'experimentalFeatures', label: 'Experimental features', category: 'advanced', type: 'boolean', defaultValue: false },
  { key: 'offlineCacheEnabled', label: 'Offline cache', category: 'advanced', type: 'boolean', defaultValue: false },
  { key: 'cacheEventsMonths', label: 'Event cache horizon (months)', category: 'advanced', type: 'number', min: 3, max: 24, defaultValue: 12 },
  { key: 'smartRecurrenceEnd', label: 'Smart recurrence end', hint: 'Auto-extend repeating series end date', category: 'advanced', type: 'boolean', defaultValue: true },
  { key: 'strictTimeValidation', label: 'Strict time validation', category: 'advanced', type: 'boolean', defaultValue: true }
]

export const DEFAULT_SETTINGS_CATALOG: Record<string, string | number | boolean> = Object.fromEntries(
  SETTING_DEFS.map((d) => [d.key, d.defaultValue])
)

export function settingDef(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((d) => d.key === key)
}
