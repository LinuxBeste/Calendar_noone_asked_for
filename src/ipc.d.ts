import type { CalendarApi } from '../electron/preload'

declare global {
  interface Window {
    calendarApi: CalendarApi
  }
}

export {}
