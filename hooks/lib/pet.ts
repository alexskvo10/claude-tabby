import type { TabPet } from '../../types'
import { L } from './i18n'

export type { Mood } from './sprites'
import type { Mood } from './sprites'

export const FACES: Record<Mood, readonly string[]> = {
  happy: ['(=^･ω･^=)', '(=^･ω･^=)', '(=^･ω･^=)', '(=^-ω-^=)'],
  work: ['(=•ω•=)ﾉ', '(=•ω•=)/', '(=•ω•=)ﾉ', '(=•ω•=)~'],
  sad: ['(=;ω;=)'],
  sleep: ['(=-ω-=) z', '(=-ω-=) zZ', '(=-ω-=) zZz'],
  proud: ['(=^▽^=)ﾉ', '(=^▽^=)/'],
  focus: ['(=òωó=)'],
}

/** A face for the mood, stepped by the clock so it blinks and breathes. */
export function face(mood: Mood, now: number): string {
  const frames = FACES[mood]
  return frames[Math.floor(now / 1000) % frames.length]!
}

export type MoodInput = {
  isWorking: boolean
  isTestsRed: boolean
  isFocused: boolean
  idleMs: number
  sinceUnlockMs: number
}

export function mood(input: MoodInput): Mood {
  if (input.sinceUnlockMs < 60_000) return 'proud'
  if (input.isWorking) return 'work'
  if (input.isTestsRed) return 'sad'
  if (input.idleMs > 15 * 60_000) return 'sleep'
  if (input.isFocused) return 'focus'
  return 'happy'
}

/** Level 1 at 0 xp; each next level costs a little more. */
export function level(xp: number): { level: number; into: number; span: number } {
  let lvl = 1
  let floor = 0
  let span = 20
  while (xp >= floor + span) {
    floor += span
    lvl += 1
    span = 20 + (lvl - 1) * 15
  }
  return { level: lvl, into: xp - floor, span }
}

export const XP = {
  turn: 2,
  testsGreen: 10,
  todoDone: 3,
  focusDone: 8,
  achievement: 15,
} as const

export const ACHIEVEMENT_IDS = [
  'first',
  'chatty',
  'toolsmith',
  'green',
  'comeback',
  'clean',
  'lightning',
  'productive',
  'flow',
  'deepwork',
  'deep',
  'marathon',
  'owl',
  'streak3',
  'streak7',
  'shipit',
  'committer',
] as const

export type Achievement = { id: string; title: string; hint: string }

export function achievement(id: string): Achievement | undefined {
  const words = L.ach[id]
  return words === undefined ? undefined : { id, title: words[0], hint: words[1] }
}

export function achievements(): Achievement[] {
  return ACHIEVEMENT_IDS.map(id => achievement(id)!)
}

export const NEW_PET: TabPet = {
  name: 'Таби',
  xp: 0,
  achievements: [],
  lastUnlock: null,
  lastUnlockAt: 0,
  totals: { turns: 0, tools: 0, todosDone: 0 },
}

/** Big art for the pet tab, one per mood, two frames each. */
export const ART: Record<Mood, readonly (readonly string[])[]> = {
  happy: [
    [' /\\_/\\  ', '( ^.^ ) ', ' > ♥ <~ '],
    [' /\\_/\\  ', '( ^.^ ) ', ' > ♥ < ~'],
  ],
  work: [
    [' /\\_/\\  ', '( •.• ) ', ' />_<\\  '],
    [' /\\_/\\  ', '( •.• ) ', ' \\>_</  '],
  ],
  sad: [[' /\\_/\\  ', '( ;.; ) ', ' > ~ <  ']],
  sleep: [
    [' /\\_/\\ z', '( -.- ) ', ' > ~ <  '],
    [' /\\_/\\ Z', '( -.- )z', ' > ~ <  '],
  ],
  proud: [
    [' /\\_/\\  ', '( ^o^ ) ', '\\> ★ </ '],
    [' /\\_/\\  ', '( ^o^ ) ', '/> ★ <\\ '],
  ],
  focus: [[' /\\_/\\  ', '( •_• ) ', ' > ◎ <  ']],
}

export function art(mood: Mood, now: number): readonly string[] {
  const frames = ART[mood]
  return frames[Math.floor(now / 1000) % frames.length]!
}
