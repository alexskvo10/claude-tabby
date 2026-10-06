// How long the context and the rate limits last at the current pace.
import type { TabLimitSample, TabTurn } from '../../types'

const MIN_SPAN = 10 * 60_000

/** Tokens the context grows by per turn, from the turns that recorded it. */
export function contextGrowth(history: readonly TabTurn[]): number | undefined {
  const fills = history.filter(t => t.context !== undefined).slice(-6)
  if (fills.length < 3) return undefined
  const steps: number[] = []
  for (let i = 1; i < fills.length; i += 1) {
    const step = fills[i]!.context! - fills[i - 1]!.context!
    // a /compact drops the fill: that step says nothing about the pace
    if (step >= 0) steps.push(step)
  }
  if (steps.length < 2) return undefined
  const avg = steps.reduce((s, x) => s + x, 0) / steps.length
  return avg > 0 ? avg : undefined
}

/** Whole turns left before the window fills, or undefined when unknown. */
export function turnsLeft(tokens: number | undefined, window: number, growth: number | undefined): number | undefined {
  if (tokens === undefined || growth === undefined || growth <= 0) return undefined
  return Math.max(0, Math.floor((window - tokens) / growth))
}

export type Burn = { perHour: number; runsOutInMs?: number }

/**
 * The burn rate of one limit window over the samples of that same window,
 * and when it runs out at that rate, if it does before the reset.
 */
export function burn(samples: readonly TabLimitSample[], kind: string, now: number, resetsInMs?: number): Burn | undefined {
  const mine = samples.filter(s => s.kind === kind)
  const last = mine.at(-1)
  if (last === undefined) return undefined
  const same = mine.filter(s => s.resetsAt === last.resetsAt)
  const first = same.find(s => last.at - s.at <= 3 * 3_600_000) ?? same[0]!
  const span = last.at - first.at
  if (span < MIN_SPAN) return undefined
  const perHour = ((last.percent - first.percent) / span) * 3_600_000
  if (perHour <= 0) return { perHour: 0 }
  const leftMs = ((100 - last.percent) / perHour) * 3_600_000 - (now - last.at)
  const runsOut = Math.max(0, leftMs)
  if (resetsInMs !== undefined && runsOut >= resetsInMs) return { perHour }
  return { perHour, runsOutInMs: runsOut }
}

/** Keeps the samples worth keeping: the last few hours, one a minute. */
export function addSample(samples: readonly TabLimitSample[], next: TabLimitSample): TabLimitSample[] {
  const kept = samples.filter(s => next.at - s.at <= 6 * 3_600_000)
  const last = [...kept].reverse().find(s => s.kind === next.kind)
  if (last !== undefined && last.percent === next.percent && last.resetsAt === next.resetsAt && next.at - last.at < 60_000) {
    return kept
  }
  return [...kept, next].slice(-400)
}
