// Which frame of Tabby shows at a moment: blinks, a wagging tail, typing paws.
import type { Mood } from './sprites'
import { frames } from './sprites'

/** The frame for `mood` at `ms`; the animator repaints only when it changes. */
export function frameAt(mood: Mood, ms: number, size: 'small' | 'big'): number {
  const n = frames(mood, size)
  if (n <= 1) return 0
  if (mood === 'happy') {
    // a blink of 160 ms every 4.2 s; between blinks the big cat wags its tail
    if (ms % 4200 < 160) return n - 1
    return size === 'big' ? Math.floor(ms / 650) % 2 : 0
  }
  if (mood === 'work') return Math.floor(ms / 280) % n
  if (mood === 'sleep') return Math.floor(ms / 900) % n
  if (mood === 'proud') return Math.floor(ms / 350) % n
  return Math.floor(ms / 1200) % n
}
