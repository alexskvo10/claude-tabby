import type { TabPet } from '../../types'

export type Mood = 'happy' | 'work' | 'sad' | 'sleep' | 'proud' | 'focus'

export const FACES: Record<Mood, readonly string[]> = {
  happy: ['(=^･ω･^=)', '(=^･ω･^=)', '(=^-ω-^=)'],
  work: ['(=•ω•=)ﾉ', '(=•ω•=)ﾉ', '(=•ω•=)/'],
  sad: ['(=;ω;=)'],
  sleep: ['(=-ω-=) z', '(=-ω-=) zZ'],
  proud: ['(=^▽^=)ﾉ'],
  focus: ['(=òωó=)'],
}

/** A face for the mood, stepped by the tick so it blinks and breathes. */
export function face(mood: Mood, tick: number): string {
  const frames = FACES[mood]
  return frames[Math.floor(tick / 1000) % frames.length]!
}

export const MOOD_TEXT: Record<Mood, string> = {
  happy: 'мурлычет',
  work: 'помогает',
  sad: 'грустит: тесты красные',
  sleep: 'спит',
  proud: 'гордится',
  focus: 'сосредоточен',
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

export type Achievement = { id: string; title: string; hint: string }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', title: 'Первый шаг', hint: 'Завершить первый ход' },
  { id: 'chatty', title: 'Разговорчивый', hint: '50 ходов всего' },
  { id: 'toolsmith', title: 'Мастер инструментов', hint: '200 вызовов инструментов' },
  { id: 'green', title: 'Всё зелёное', hint: 'Тесты прошли' },
  { id: 'comeback', title: 'Камбэк', hint: 'Починить красные тесты' },
  { id: 'clean', title: 'Чистая работа', hint: 'Ход с 10+ инструментами без ошибок' },
  { id: 'lightning', title: 'Молния', hint: 'Ход с инструментами быстрее 10с' },
  { id: 'productive', title: 'Продуктивность', hint: 'Закрыть 10 задач' },
  { id: 'flow', title: 'В потоке', hint: 'Довести помодоро до конца' },
  { id: 'deep', title: 'Бездонная память', hint: 'Заполнить контекст на 90%' },
  { id: 'marathon', title: 'Марафон', hint: 'Сессия дольше 2 часов' },
  { id: 'owl', title: 'Ночная сова', hint: 'Работать между 0:00 и 5:00' },
]

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id)
}

export const NEW_PET: TabPet = {
  name: 'Таби',
  xp: 0,
  achievements: [],
  lastUnlock: null,
  lastUnlockAt: 0,
  totals: { turns: 0, tools: 0, todosDone: 0 },
}

/** Big art for the pet tab, one per mood. */
export const ART: Record<Mood, readonly string[]> = {
  happy: [' /\\_/\\ ', '( ^.^ )', ' > ♥ < '],
  work: [' /\\_/\\ ', '( •.• )', ' />_<\\ '],
  sad: [' /\\_/\\ ', '( ;.; )', ' > ~ < '],
  sleep: [' /\\_/\\  z', '( -.- ) Z', ' > ~ < '],
  proud: [' /\\_/\\ ', '( ^o^ )', '\\> ★ </'],
  focus: [' /\\_/\\ ', '( •_• )', ' > ◎ < '],
}
