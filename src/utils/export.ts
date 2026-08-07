import { format } from 'date-fns'
import type { Calendar, Event } from '@shared/types'

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function fmtTime(iso?: string, allDay?: boolean): string {
  if (!iso) return ''
  if (allDay) return 'All day'
  return format(new Date(iso), 'yyyy-MM-dd HH:mm')
}

export function exportEventsCsv(events: Event[], calendars: Calendar[], rangeLabel: string): void {
  const byId = new Map(calendars.map((c) => [c.id, c]))
  const rows = [
    ['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All day', 'Calendar', 'Location', 'Description', 'Busy'].join(','),
    ...events.map((ev) => {
      const start = ev.allDay ? new Date((ev.startDate ?? '') + 'T00:00:00') : new Date(ev.startsAt ?? '')
      const end = ev.allDay ? new Date((ev.endDate ?? ev.startDate ?? '') + 'T00:00:00') : new Date(ev.endsAt ?? '')
      const csv = (s: string): string => `"${s.replace(/"/g, '""')}"`
      return [
        csv(ev.title),
        format(start, 'yyyy-MM-dd'),
        ev.allDay ? '' : format(start, 'HH:mm'),
        format(end, 'yyyy-MM-dd'),
        ev.allDay ? '' : format(end, 'HH:mm'),
        ev.allDay ? 'TRUE' : 'FALSE',
        csv(byId.get(ev.calendarId)?.name ?? ''),
        csv(ev.location ?? ''),
        csv(ev.description ?? ''),
        ev.busy === false ? 'FALSE' : 'TRUE'
      ].join(',')
    })
  ].join('\n')
  download(`calendar-${rangeLabel}.csv`, '\uFEFF' + rows, 'text/csv')
}

/** Opens a printer-friendly listing of the given events in a hidden iframe. */
export function printEvents(events: Event[], calendars: Calendar[], title: string): void {
  const byId = new Map(calendars.map((c) => [c.id, c]))
  const sorted = [...events].sort((a, b) => (a.startsAt ?? a.startDate ?? '').localeCompare(b.startsAt ?? b.startDate ?? ''))
  const rows = sorted
    .map((ev) => {
      const cal = byId.get(ev.calendarId)
      const when = ev.allDay
        ? `${ev.startDate ?? ''}${ev.endDate && ev.endDate !== ev.startDate ? ' – ' + ev.endDate : ''}`
        : `${fmtTime(ev.startsAt)} – ${ev.endsAt ? format(new Date(ev.endsAt), 'HH:mm') : ''}`
      const color = ev.color ?? cal?.color ?? '#1a73e8'
      return `<tr>
        <td class="dot"><span style="background:${color}"></span></td>
        <td class="title">${escapeHtml(ev.title)}</td>
        <td class="when">${escapeHtml(when)}</td>
        <td class="cal">${escapeHtml(cal?.name ?? '')}</td>
        <td class="loc">${escapeHtml(ev.location ?? '')}</td>
      </tr>`
    })
    .join('')
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1f2937; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  p.sub { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .dot span { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
  .title { font-weight: 600; }
  .when { white-space: nowrap; }
  .loc { color: #4b5563; }
  .cal { color: #4b5563; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${events.length} event${events.length === 1 ? '' : 's'} · ${escapeHtml(new Date().toLocaleString())}</p>
  <table>
    <thead><tr><th></th><th>Event</th><th>When</th><th>Calendar</th><th>Location</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function () { window.print() }<\/script>
</body>
</html>`
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  }, 300)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
