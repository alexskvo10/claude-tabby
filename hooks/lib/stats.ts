// Days of work: what each day held, and how many days in a row.
import type { TabDay, TabStats } from '../../types'

export const NO_DAY: TabDay = { turns: 0, tools: 0, focusMs: 0, costUsd: 0 }

export function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addToDay(stats: TabStats, at: number, add: Partial<TabDay>): TabStats {
  const key = dayKey(at)
  const was = stats.days[key] ?? NO_DAY
  const day: TabDay = {
    turns: was.turns + (add.turns ?? 0),
    tools: was.tools + (add.tools ?? 0),
    focusMs: was.focusMs + (add.focusMs ?? 0),
    costUsd: was.costUsd + (add.costUsd ?? 0),
  }
  const keys = Object.keys(stats.days).sort().slice(-89)
  const days: Record<string, TabDay> = {}
  for (const k of keys) days[k] = stats.days[k]!
  days[key] = day
  return { days }
}

/** The last `n` days, oldest first, today last. */
export function lastDays(stats: TabStats, now: number, n: number): { key: string; day: TabDay }[] {
  const out: { key: string; day: TabDay }[] = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dayKey(d.getTime())
    out.push({ key, day: stats.days[key] ?? NO_DAY })
  }
  return out
}

/** Days in a row with at least one turn, counting back from today (or yesterday). */
export function streak(stats: TabStats, now: number): number {
  let count = 0
  const d = new Date(now)
  if ((stats.days[dayKey(d.getTime())]?.turns ?? 0) === 0) d.setDate(d.getDate() - 1)
  for (;;) {
    if ((stats.days[dayKey(d.getTime())]?.turns ?? 0) === 0) return count
    count += 1
    d.setDate(d.getDate() - 1)
  }
}
