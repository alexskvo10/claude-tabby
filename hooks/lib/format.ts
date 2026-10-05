// Pure formatting helpers: no `$`, so the tests exercise them directly.
import { C, L } from './i18n'

export { C }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Cells a string takes; every glyph this mod draws is one cell wide. */
export function cells(text: string): number {
  return Array.from(text).length
}

export function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  const chars = Array.from(text)
  if (chars.length <= max) return text
  if (max === 1) return '…'
  return chars.slice(0, max - 1).join('') + '…'
}

export function pad(text: string, width: number): string {
  const n = cells(text)
  return n >= width ? truncate(text, width) : text + ' '.repeat(width - n)
}

export function tokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
}

/** A span of time, short: 9с, 3м 05с, 1ч 12м, 3д 4ч. */
export function duration(ms: number): string {
  const { s, m, h, d } = L.u
  const safe = Math.max(0, ms)
  if (safe < MINUTE) return `${Math.floor(safe / 1000)}${s}`
  if (safe < HOUR) {
    const mm = Math.floor(safe / MINUTE)
    const ss = Math.floor((safe % MINUTE) / 1000)
    return mm < 10 ? `${mm}${m} ${String(ss).padStart(2, '0')}${s}` : `${mm}${m}`
  }
  if (safe < DAY) {
    const hh = Math.floor(safe / HOUR)
    const mm = Math.floor((safe % HOUR) / MINUTE)
    return mm === 0 ? `${hh}${h}` : `${hh}${h} ${mm}${m}`
  }
  const dd = Math.floor(safe / DAY)
  const hh = Math.floor((safe % DAY) / HOUR)
  return hh === 0 ? `${dd}${d}` : `${dd}${d} ${hh}${h}`
}

/** The most compact span: 9с, 3м, 1ч12м, 3д4ч. */
export function compact(ms: number): string {
  const { s, m, h, d } = L.u
  const safe = Math.max(0, ms)
  if (safe < MINUTE) return `${Math.floor(safe / 1000)}${s}`
  if (safe < HOUR) return `${Math.floor(safe / MINUTE)}${m}`
  if (safe < DAY) {
    const hh = Math.floor(safe / HOUR)
    const mm = Math.floor((safe % HOUR) / MINUTE)
    return mm === 0 ? `${hh}${h}` : `${hh}${h}${mm}${m}`
  }
  const dd = Math.floor(safe / DAY)
  const hh = Math.floor((safe % DAY) / HOUR)
  return hh === 0 ? `${dd}${d}` : `${dd}${d}${hh}${h}`
}

/** Whole minutes left, rounded up so a countdown never reads 0 early. */
export function minutesLeft(ms: number): string {
  const mm = Math.ceil(Math.max(0, ms) / MINUTE)
  return mm >= 60 ? compact(mm * MINUTE) : `${mm}${L.u.m}`
}

/** A minutes-and-seconds clock for a countdown: 24:59, 1:02:03. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = String(total % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

/** A wall-clock time of day, or a weekday and time when it is not today. */
export function timeOfDay(at: number, now: number): string {
  const d = new Date(at)
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (new Date(now).toDateString() === d.toDateString()) return hm
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}

export function ago(at: number, now: number): string {
  const span = now - at
  if (span < 45_000) return L.justNow
  return L.ago(compact(span))
}

/** Milliseconds until an ISO timestamp, or undefined when it does not parse. */
export function until(iso: string | undefined, now: number): number | undefined {
  if (iso === undefined) return undefined
  const at = Date.parse(iso)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

/** Green below 60, yellow below 85, red from there: for anything that fills. */
export function heat(percent: number): string {
  if (percent >= 85) return C.red
  if (percent >= 60) return C.yellow
  return C.green
}

/** A filled/empty bar, `width` cells: ▰▰▰▱▱▱. */
export function bar(percent: number, width: number): { fill: string; rest: string } {
  const w = Math.max(1, Math.floor(width))
  const clamped = Math.min(100, Math.max(0, percent))
  let filled = Math.round((clamped / 100) * w)
  if (clamped > 0 && filled === 0) filled = 1
  return { fill: '▰'.repeat(filled), rest: '▱'.repeat(w - filled) }
}

const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return ''
  const max = Math.max(...values)
  if (max <= 0) return SPARKS[0]!.repeat(values.length)
  return values
    .map(v => SPARKS[Math.min(SPARKS.length - 1, Math.floor((v / max) * (SPARKS.length - 1)))]!)
    .join('')
}

export function percent(n: number): string {
  return `${Math.round(n)}%`
}

export function plural(n: number, one: string, few: string, many: string): string {
  return L.plural(n, one, few, many)
}

export function limitLabel(kind: string): string {
  return L.limit[kind] ?? (kind.startsWith('seven_day_') ? `${L.limit.seven_day} ${kind.slice(10)}` : kind)
}

export function money(usd: number): string {
  if (usd < 0.995) return `${Math.round(usd * 100)}¢`
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(1)}`
}
