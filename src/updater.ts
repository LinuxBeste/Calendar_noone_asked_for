export interface UpdateInfo {
  version: string
  pageUrl: string
  apkUrl: string
}

export const UPDATE_REPO = 'LinuxBeste/Calendar_noone_asked_for'

export async function fetchLatestRelease(): Promise<UpdateInfo> {
  const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`)
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status})`)
  const json = (await res.json()) as { tag_name?: string; html_url?: string }
  const tag = json.tag_name
  if (!tag) throw new Error('Update check failed (no release found)')
  return {
    version: tag.replace(/^v/, ''),
    pageUrl: json.html_url ?? `https://github.com/${UPDATE_REPO}/releases/latest`,
    apkUrl: `https://github.com/${UPDATE_REPO}/releases/download/${tag}/app-debug.apk`
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export function isElectron(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
}

export function isInstalled(): boolean {
  return isElectron() || (typeof window !== 'undefined' && !!window.Capacitor)
}

/** Opens the update on the current platform: system browser with the APK on Android, release page elsewhere. */
export async function openUpdateDownload(info: UpdateInfo): Promise<void> {
  if (typeof window !== 'undefined' && !!window.Capacitor) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: info.apkUrl })
    return
  }
  window.open(info.pageUrl, '_blank', 'noopener')
}