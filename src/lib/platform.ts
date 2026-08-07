export interface NativeCapacitor {
  getPlatform(): string
  Plugins: {
    App?: {
      addListener(event: 'backButton', cb: (e: { canGoBack?: boolean }) => void): Promise<{ remove(): void }>
      minimizeApp?(): Promise<void>
    }
    Share?: {
      share(opts: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<{ activityType?: string }>
    }
    LocalNotifications?: {
      requestPermissions(): Promise<{ display: string }>
      schedule(items: Array<{ id: number; title: string; body?: string; schedule: { at?: Date; every?: unknown } }>): Promise<void>
      cancel(items: { notifications: Array<{ id: number }> }): Promise<void>
      getPending(): Promise<{ notifications: Array<{ id: number }> }>
    }
  }
}

declare global {
  interface Window {
    Capacitor?: NativeCapacitor
  }
}

export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!window.Capacitor
}

export function isAndroid(): boolean {
  return isCapacitor() && window.Capacitor!.getPlatform() === 'android'
}

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

export function nativeShare(opts: { title?: string; text?: string; url?: string }): Promise<boolean> {
  const share = window.Capacitor?.Plugins.Share
  if (share) return share.share(opts).then(() => true)
  if (navigator.share) return navigator.share({ title: opts.title, text: opts.text, url: opts.url }).then(() => true)
  return Promise.resolve(false)
}

export function minimizeApp(): Promise<void> {
  const app = window.Capacitor?.Plugins.App
  if (app?.minimizeApp) return app.minimizeApp()
  return Promise.resolve()
}

export async function onAndroidBack(cb: () => void): Promise<() => void> {
  const app = window.Capacitor?.Plugins.App
  if (!app || !isAndroid()) return () => undefined
  const listener = await app.addListener('backButton', () => cb())
  return () => {
    void listener.remove()
  }
}

const localNotifications = (): NonNullable<NativeCapacitor['Plugins']['LocalNotifications']> | undefined =>
  window.Capacitor?.Plugins.LocalNotifications

export function nativeNotificationsAvailable(): boolean {
  return isCapacitor() && !!localNotifications()
}

let permissionGranted: boolean | null = null

export async function ensureNotificationPermission(): Promise<boolean> {
  const ln = localNotifications()
  if (!ln) return false
  if (permissionGranted === true) return true
  try {
    const res = await ln.requestPermissions()
    permissionGranted = res.display === 'granted'
    return permissionGranted
  } catch {
    return false
  }
}

export async function scheduleLocalNotification(item: { id: number; title: string; body?: string; at: Date }): Promise<void> {
  const ln = localNotifications()
  if (!ln) return
  await ln.schedule([{ id: item.id, title: item.title, body: item.body, schedule: { at: item.at } }])
}

export async function cancelLocalNotifications(ids: number[]): Promise<void> {
  const ln = localNotifications()
  if (!ln || ids.length === 0) return
  await ln.cancel({ notifications: ids.map((id) => ({ id })) })
}

export async function pendingLocalNotificationIds(): Promise<number[]> {
  const ln = localNotifications()
  if (!ln) return []
  const res = await ln.getPending()
  return res.notifications.map((n) => n.id)
}
