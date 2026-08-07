import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Notification, dialog, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { api } from './api-client'
import updaterPkg from 'electron-updater'
const { autoUpdater } = updaterPkg

const isDev = !!process.env.ELECTRON_RENDERER_URL

let updaterPrompted = false

let liveSocket: WebSocket | null = null

function connectLive(token: string | undefined): void {
  try {
    liveSocket?.close()
    if (!token) return
    const base = process.env.CALENDAR_API_URL ?? 'http://localhost:3001'
    const url = base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token)
    const ws = new WebSocket(url)
    liveSocket = ws
    ws.onmessage = (e) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.webContents.send('ws:message', String(e.data))
    }
    ws.onclose = () => {
      if (liveSocket === ws) liveSocket = null
    }
    ws.onerror = () => ws.close()
  } catch (err) {
    console.error('[live] connect failed:', err)
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', () => {
    if (updaterPrompted) return
    updaterPrompted = true
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Update available',
        message: `A new version of ${app.getName()} is available.`,
        detail: 'Download and install it now?',
        buttons: ['Later', 'Update now'],
        defaultId: 1,
        cancelId: 0
      })
      .then(({ response }) => {
        if (response === 1) autoUpdater.downloadUpdate().catch((err: unknown) => console.error('[updater] download failed:', err))
      })
  })
  autoUpdater.on('update-downloaded', () => {
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'The update has been downloaded.',
        detail: 'Restart now to finish installing it?',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (err: Error) => console.error('[updater]', err.message))
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => console.error('[updater] check failed:', err.message))
  }, 10_000)
}

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

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (isDev) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let reminderTimer: ReturnType<typeof setInterval> | null = null

/** 32x32 calendar glyph embedded as data URL (no asset pipeline needed). */
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAV0lEQVR42u3YsQkAIAxE0czhmi7tFlFiERDLgCf8Kw5J9QjYxOyHtD7cfGW/nlYyMjGTq9v+ROrYH74qn+b/wIcPHz58+PDhw4cPHz583Ddq7xua+9PNBOJoyWgpRS9iAAAAAElFTkSuQmCC'

let tray: Tray | null = null
let quitting = false

/** Closing the window hides the app to the tray; reminders keep running. */
function createTray(): void {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Calendar')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Calendar', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit() } }
    ])
  )
  tray.on('click', showWindow)
}

function showWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.show()
    win.focus()
    return
  }
  void createWindow()
}

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
  ipcMain.handle('auth:register', async (_e, payload: { email: string; name: string; password: string }) => {
    const result = (await api.register(payload)) as { token?: string }
    connectLive(result.token)
    return result
  })
  ipcMain.handle('auth:login', async (_e, payload: { email: string; password: string }) => {
    const result = (await api.login(payload.email, payload.password)) as { token?: string }
    connectLive(result.token)
    return result
  })
  ipcMain.handle('auth:logout', (_e, payload: { token: string }) => {
    connectLive(undefined)
    return api.logout(payload.token)
  })
  ipcMain.handle('auth:validate', async (_e, payload: { token: string }) => {
    const result = (await api.validate(payload.token)) as unknown
    if (result) connectLive(payload.token)
    else connectLive(undefined)
    return result
  })

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
  ipcMain.handle('calendar:link:create', (_e, payload: { token: string; calendarId: string }) =>
    api.createLink(payload.token, payload.calendarId))
  ipcMain.handle('calendar:link:list', (_e, payload: { token: string; calendarId: string }) =>
    api.listLinks(payload.token, payload.calendarId))
  ipcMain.handle('calendar:link:remove', (_e, payload: { token: string; calendarId: string; linkToken: string }) =>
    api.deleteLink(payload.token, payload.calendarId, payload.linkToken))
  ipcMain.handle('feeds:list', (_e, payload: { token: string }) =>
    api.listFeeds(payload.token))
  ipcMain.handle('feeds:create', (_e, payload: { token: string; input: unknown }) =>
    api.createFeed(payload.token, payload.input as never))
  ipcMain.handle('feeds:remove', (_e, payload: { token: string; feedId: string }) =>
    api.deleteFeed(payload.token, payload.feedId))
  ipcMain.handle('feeds:sync', (_e, payload: { token: string; feedId: string }) =>
    api.syncFeed(payload.token, payload.feedId))
  ipcMain.handle('public:occurrences', (_e, payload: { token: string; from: string; to: string }) =>
    api.getPublicOccurrences(payload.token, payload.from, payload.to))

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
  ipcMain.handle('events:trash', (_e, payload: { token: string }) =>
    api.listTrash(payload.token))
  ipcMain.handle('events:restore', (_e, payload: { token: string; id: string }) =>
    api.restoreEvent(payload.token, payload.id))
  ipcMain.handle('events:purge', (_e, payload: { token: string; id: string }) =>
    api.purgeEvent(payload.token, payload.id))
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
  ipcMain.handle('reminders:upcoming', (_e, payload: { token: string; days: number }) =>
    api.listUpcomingReminders(payload.token, payload.days))

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
  ipcMain.handle('import:ical-content', async (_e, payload: { token: string; calendarId: string; content: string }) => {
    const count = await api.importICalContent(payload.token, payload.calendarId, payload.content)
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
  setupAutoUpdater()
  createTray()

  app.on('activate', showWindow)
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
