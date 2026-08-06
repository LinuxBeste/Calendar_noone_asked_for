import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { api } from './api-client'

const isDev = !!process.env.ELECTRON_RENDERER_URL

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Calendar',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null

function startReminderEngine(): void {
  if (reminderTimer) return
  const check = async (): Promise<void> => {
    const due = await api.listDueReminders(5)
    for (const r of due) {
      const notif = new Notification({
        title: r.title,
        body: `Starting ${formatTime(new Date(r.startsAt!))} · ${r.calendarName}`,
        silent: false
      })
      notif.show()
      await api.markReminderSent(r.id)
    }
  }
  check().catch((err) => console.error('[reminders] check failed:', err))
  reminderTimer = setInterval(() => {
    check().catch((err) => console.error('[reminders] check failed:', err))
  }, 30_000)
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function registerIpc(): void {
  // ---- auth ----
  ipcMain.handle('auth:register', (_e, payload: { email: string; name: string; password: string }) => api.register(payload))
  ipcMain.handle('auth:login', (_e, payload: { email: string; password: string }) => api.login(payload.email, payload.password))
  ipcMain.handle('auth:logout', (_e, payload: { token: string }) => api.logout(payload.token))
  ipcMain.handle('auth:validate', (_e, payload: { token: string }) => api.validate(payload.token))

  // ---- calendars ----
  ipcMain.handle('calendar:list', (_e, payload: { token: string }) => api.listCalendars(payload.token))
  ipcMain.handle('calendar:create', (_e, payload: { token: string; input: unknown }) =>
    api.createCalendar(payload.token, payload.input as never))
  ipcMain.handle('calendar:update', (_e, payload: { token: string; id: string; input: unknown }) =>
    api.updateCalendar(payload.token, payload.id, payload.input as never))
  ipcMain.handle('calendar:delete', (_e, payload: { token: string; id: string }) =>
    api.deleteCalendar(payload.token, payload.id))
  ipcMain.handle('calendar:share', (_e, payload: { token: string; calendarId: string; input: unknown }) =>
    api.shareCalendar(payload.token, payload.calendarId, payload.input as never))
  ipcMain.handle('calendar:unshare', (_e, payload: { token: string; calendarId: string; userId: string }) =>
    api.unshareCalendar(payload.token, payload.calendarId, payload.userId))
  ipcMain.handle('calendar:shares', (_e, payload: { token: string; calendarId: string }) =>
    api.listShares(payload.token, payload.calendarId))

  // ---- events ----
  ipcMain.handle('events:list', (_e, payload: { token: string; from: string; to: string; calendarIds?: string[] }) =>
    api.listEvents(payload.token, payload.from, payload.to, payload.calendarIds))
  ipcMain.handle('events:get', (_e, payload: { token: string; id: string }) =>
    api.getEvent(payload.token, payload.id))
  ipcMain.handle('events:create', (_e, payload: { token: string; input: unknown }) =>
    api.createEvent(payload.token, payload.input as never))
  ipcMain.handle('events:update', (_e, payload: { token: string; id: string; input: unknown }) =>
    api.updateEvent(payload.token, payload.id, payload.input as never))
  ipcMain.handle('events:delete', (_e, payload: { token: string; id: string }) =>
    api.deleteEvent(payload.token, payload.id))
  ipcMain.handle('events:search', (_e, payload: { token: string; query: string; calendarIds?: string[]; limit?: number }) =>
    api.searchEvents(payload.token, payload.query, payload.calendarIds, payload.limit))
  ipcMain.handle('events:listOccurrences', (_e, payload: { token: string; from: string; to: string; calendarIds?: string[] }) =>
    api.listOccurrences(payload.token, payload.from, payload.to, payload.calendarIds))
  ipcMain.handle('events:occurrences', (_e, payload: { token: string; eventId: string; from: string; to: string }) =>
    api.listEventOccurrences(payload.token, payload.eventId, payload.from, payload.to))
  ipcMain.handle('events:updateOccurrence', (_e, payload: { token: string; eventId: string; occurrence: string; input: unknown }) =>
    api.updateOccurrence(payload.token, payload.eventId, payload.occurrence, payload.input as never))
  ipcMain.handle('events:deleteOccurrence', (_e, payload: { token: string; eventId: string; occurrence: string }) =>
    api.deleteOccurrence(payload.token, payload.eventId, payload.occurrence))
  ipcMain.handle('events:splitSeries', (_e, payload: { token: string; eventId: string; occurrence: string; input: unknown }) =>
    api.splitSeries(payload.token, payload.eventId, payload.occurrence, payload.input as never))

  // ---- reminders ----
  ipcMain.handle('reminders:create', (_e, payload: { token: string; eventId: string; minutes: number }) =>
    api.createReminder(payload.token, payload.eventId, payload.minutes))
  ipcMain.handle('reminders:delete', (_e, payload: { token: string; id: string }) =>
    api.deleteReminder(payload.token, payload.id))

  // ---- iCal / backup (dialogs stay in the main process) ----
  ipcMain.handle('export:ical', async (_e, payload: { token: string; calendarIds?: string[] }) => {
    const content = await api.exportICal(payload.token, payload.calendarIds)
    const res = await dialog.showSaveDialog({ title: 'Export iCal', defaultPath: 'calendar.ics', filters: [{ name: 'iCalendar', extensions: ['ics'] }] })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeFile(res.filePath, content, 'utf8')
    return { canceled: false, filePath: res.filePath }
  })
  ipcMain.handle('import:ical', async (_e, payload: { token: string; calendarId: string }) => {
    const res = await dialog.showOpenDialog({ title: 'Import iCal', filters: [{ name: 'iCalendar', extensions: ['ics'] }], properties: ['openFile'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const content = await readFile(res.filePaths[0]!, 'utf8')
    const count = await api.importICal(payload.token, payload.calendarId, content)
    return { canceled: false, count }
  })
  ipcMain.handle('export:json', async (_e, payload: { token: string }) => {
    const content = await api.exportJson(payload.token)
    const res = await dialog.showSaveDialog({ title: 'Export backup', defaultPath: 'calendar-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (res.canceled || !res.filePath) return { canceled: true }
    await writeFile(res.filePath, content, 'utf8')
    return { canceled: false, filePath: res.filePath }
  })
  ipcMain.handle('import:json', async (_e, payload: { token: string }) => {
    const res = await dialog.showOpenDialog({ title: 'Import backup', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const content = await readFile(res.filePaths[0]!, 'utf8')
    const count = await api.importJson(payload.token, content)
    return { canceled: false, count }
  })

  // ---- storage info ----
  ipcMain.handle('app:info', () => api.info())

  // ---- settings ----
  ipcMain.handle('settings:get', (_e, payload: { token: string; key: string }) => api.getSetting(payload.token, payload.key))
  ipcMain.handle('settings:set', (_e, payload: { token: string; key: string; value: unknown }) => api.setSetting(payload.token, payload.key, payload.value))
}

app.whenReady().then(async () => {
  registerIpc()
  await createWindow()
  startReminderEngine()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
