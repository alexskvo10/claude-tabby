// Pure formatting helpers: no `$`, so the tests exercise them directly.

export const C = {
  accent: '#D97757',
  green: '#98C379',
  yellow: '#E5C07B',
  red: '#E06C75',
  blue: '#61AFEF',
  purple: '#C678DD',
  cyan: '#56B6C2',
} as const

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

export function tokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
}

/** A span of time, short: 9с, 42с, 3м 05с, 1ч 12м, 3д 4ч. */
export function duration(ms: number): string {
  const safe = Math.max(0, ms)
  if (safe < MINUTE) return `${Math.floor(safe / 1000)}с`
  if (safe < HOUR) {
    const m = Math.floor(safe / MINUTE)
    const s = Math.floor((safe % MINUTE) / 1000)
    return m < 10 ? `${m}м ${String(s).padStart(2, '0')}с` : `${m}м`
  }
  if (safe < DAY) {
    const h = Math.floor(safe / HOUR)
    const m = Math.floor((safe % HOUR) / MINUTE)
    return m === 0 ? `${h}ч` : `${h}ч ${m}м`
  }
  const d = Math.floor(safe / DAY)
  const h = Math.floor((safe % DAY) / HOUR)
  return h === 0 ? `${d}д` : `${d}д ${h}ч`
}

/** The most compact span: 9с, 42с, 3м, 1ч12м, 3д4ч. */
export function compact(ms: number): string {
  const safe = Math.max(0, ms)
  if (safe < MINUTE) return `${Math.floor(safe / 1000)}с`
  if (safe < HOUR) return `${Math.floor(safe / MINUTE)}м`
  if (safe < DAY) {
    const h = Math.floor(safe / HOUR)
    const m = Math.floor((safe % HOUR) / MINUTE)
    return m === 0 ? `${h}ч` : `${h}ч${m}м`
  }
  const d = Math.floor(safe / DAY)
  const h = Math.floor((safe % DAY) / HOUR)
  return h === 0 ? `${d}д` : `${d}д${h}ч`
}

/** A minutes-and-seconds clock for a countdown: 24:59, 1:02:03. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function ago(at: number, now: number): string {
  const span = now - at
  if (span < 45_000) return 'только что'
  return `${compact(span)} назад`
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

/** Russian plural: plural(5, 'ход', 'хода', 'ходов'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5ч'
  if (kind === 'seven_day') return '7д'
  if (kind.startsWith('seven_day_')) return `7д ${kind.slice('seven_day_'.length)}`
  if (kind === 'spend_limit') return '$'
  return kind
}

export function money(usd: number): string {
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(1)}`
}
