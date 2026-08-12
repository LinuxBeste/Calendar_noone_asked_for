import {
  nativeNotificationsAvailable,
  ensureNotificationPermission,
  scheduleLocalNotification,
  cancelLocalNotifications,
  pendingLocalNotificationIds
} from './platform'

export interface UpcomingReminder {
  id: string
  eventId: string
  minutes: number
  startsAt: string
  title: string
  calendarName: string
}

const HORIZON_DAYS = 30

export function reminderNotificationId(reminderId: string, startsAt: string): number {
  const s = `${reminderId}|${startsAt}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2_000_000_000
}

export function inSilentHours(settings: { silentHoursEnabled: boolean; silentHoursStart: number; silentHoursEnd: number }, at: Date): boolean {
  if (!settings.silentHoursEnabled) return false
  const h = at.getHours()
  const { silentHoursStart: start, silentHoursEnd: end } = settings
  if (start < end) return h >= start && h < end
  return h >= start || h < end
}

let reconciling = false
let reconcileTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleReconcile(delayMs = 5000): void {
  if (reconcileTimer) clearTimeout(reconcileTimer)
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null
    void reconcileLocalNotifications()
  }, delayMs)
}

export async function reconcileLocalNotifications(): Promise<void> {
  if (!nativeNotificationsAvailable()) return
  if (reconciling) return
  const token = localStorage.getItem('calendar.token')
  if (!token) return
  reconciling = true
  try {
    const granted = await ensureNotificationPermission()
    if (!granted) return
    const settings = useCalendarState()
    if (!settings.notificationsEnabled) {
      const pending = await pendingLocalNotificationIds()
      if (pending.length > 0) await cancelLocalNotifications(pending)
      return
    }
    const reminders = (await window.calendarApi.reminders.upcoming(token, HORIZON_DAYS)) as UpcomingReminder[]
    const desired = new Map<number, { title: string; body: string; at: Date }>()
    for (const r of reminders) {
      const at = new Date(new Date(r.startsAt).getTime() - r.minutes * 60000)
      if (at.getTime() <= Date.now()) continue
      if (inSilentHours(settings, at)) continue
      desired.set(reminderNotificationId(r.id, r.startsAt), {
        title: r.title,
        body: `${new Date(r.startsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${r.calendarName}`,
        at
      })
    }
    if (settings.notifyUpcomingEvents && settings.notifyUpcomingWindow >= 5) {
      const winMs = settings.notifyUpcomingWindow * 60000
      const now = new Date()
      const from = now.toISOString()
      const to = new Date(now.getTime() + winMs).toISOString()
      try {
        const occurrences = (await window.calendarApi.events.listOccurrences(token, from, to)) as Array<{
          start: string
          event: { id: string; calendarId: string; title: string }
        }>
        const calNames = new Map<string, string>()
        for (const occ of occurrences) {
          const startMs = new Date(occ.start).getTime()
          if (startMs <= Date.now()) continue
          const fireAt = new Date(Math.max(startMs - winMs, Date.now()))
          if (inSilentHours(settings, fireAt)) continue
          if (!calNames.has(occ.event.calendarId)) {
            try {
              const cals = (await window.calendarApi.calendars.list(token)) as Array<{ id: string; name: string }>
              for (const c of cals) calNames.set(c.id, c.name)
            } catch {
              // calendar list unavailable — fall back to generic label
            }
          }
          desired.set(reminderNotificationId(`upcoming:${occ.event.id}:${occ.start}`, occ.start), {
            title: occ.event.title,
            body: `Starts at ${new Date(startMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${calNames.get(occ.event.calendarId) ?? 'Calendar'}`,
            at: fireAt
          })
        }
      } catch {
        // occurrence fetch failed — reminders above are still valid
      }
    }
    const pending = await pendingLocalNotificationIds()
    const toCancel = pending.filter((id) => !desired.has(id))
    const toAdd = [...desired.entries()].filter(([id]) => !pending.includes(id))
    if (toCancel.length > 0) await cancelLocalNotifications(toCancel)
    for (const [id, d] of toAdd) {
      await scheduleLocalNotification({ id, title: d.title, body: d.body, at: d.at })
    }
  } catch {
    // backend unreachable or scheduling failed — try again on the next trigger
  } finally {
    reconciling = false
  }
}

export function startNativeReminderEngine(): void {
  if (!nativeNotificationsAvailable()) return
  const refresh = (): void => scheduleReconcile(0)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh()
  })
  setInterval(refresh, 15 * 60_000)
  refresh()
}

type SettingsLike = {
  notificationsEnabled: boolean
  silentHoursEnabled: boolean
  silentHoursStart: number
  silentHoursEnd: number
  notifyUpcomingEvents: boolean
  notifyUpcomingWindow: number
}

let useCalendarState: () => SettingsLike = () => ({
  notificationsEnabled: true,
  silentHoursEnabled: false,
  silentHoursStart: 22,
  silentHoursEnd: 7,
  notifyUpcomingEvents: false,
  notifyUpcomingWindow: 30
})

export function bindSettingsProvider(provider: () => SettingsLike): void {
  useCalendarState = provider
}
