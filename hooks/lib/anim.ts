// Which frame of Tabby shows at a moment: blinks, a wagging tail, typing paws.
import type { Mood } from './sprites'
import { frames } from './sprites'

/** The frame for `mood` at `ms`; the animator repaints only when it changes. */
export function frameAt(mood: Mood, ms: number, size: 'small' | 'big'): number {
  const n = frames(mood, size)
  if (n <= 1) return 0
  if (mood === 'happy' && size === 'small') {
    // the smile stays; a heart pops up by the ear for 700 ms every 4.2 s
    return ms % 4200 < 700 ? 1 : 0
  }
  if (mood === 'happy') {
    // a blink of 160 ms every 4.2 s; between blinks the big cat wags its tail
    if (ms % 4200 < 160) return n - 1
    return Math.floor(ms / 650) % 2
  }
  if (mood === 'work') return Math.floor(ms / 280) % n
  if (mood === 'sleep') return Math.floor(ms / 900) % n
  if (mood === 'proud') return Math.floor(ms / 350) % n
  return Math.floor(ms / 1200) % n
}

/** How long a loop of `mood` lasts before it repeats, in ms. */
function period(mood: Mood, size: 'small' | 'big'): number {
  const n = frames(mood, size)
  if (mood === 'happy') return 4200
  if (mood === 'work') return 280 * n
  if (mood === 'sleep') return 900 * n
  if (mood === 'proud') return 350 * n
  return 1200 * n
}

/** One loop of `mood` as frames and how long each shows: what an SVG plays. */
export function cycle(mood: Mood, size: 'small' | 'big'): { frame: number; ms: number }[] {
  const total = period(mood, size)
  const out: { frame: number; ms: number }[] = []
  for (let t = 0; t < total; t += 10) {
    const frame = frameAt(mood, t, size)
    const last = out.at(-1)
    if (last !== undefined && last.frame === frame) last.ms += 10
    else out.push({ frame, ms: 10 })
  }
  return out
}
