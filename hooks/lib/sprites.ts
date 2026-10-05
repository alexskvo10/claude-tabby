// Tabby in pixels. Letters are palette keys, '.' is transparent:
//   O fur   D outline   L light belly   K eye   W eye shine   P nose/pink
//   Z sleep z   T tear   Y sparkle   S screen   G screen glow
import type { Rgb, Sprite } from './pixels'
import { rgb, sprite } from './pixels'

export const PALETTE: Record<string, Rgb> = {
  O: rgb('#E08A5F'),
  D: rgb('#8A4A32'),
  L: rgb('#F4C7A1'),
  K: rgb('#2B2024'),
  W: rgb('#FFFFFF'),
  P: rgb('#F28AA0'),
  Z: rgb('#9FB4D8'),
  T: rgb('#6FB7FF'),
  Y: rgb('#FFD866'),
  S: rgb('#3B4252'),
  G: rgb('#7FD4C1'),
}

// ---------------------------------------------------------------- band: 10 x 4

const HEAD = (eyes: string, mouth: string, extra: [string, string] = ['..........', '..........']) => [
  merge('.D......D.', extra[0]),
  merge('.DOOOOOOD.', extra[1]),
  `.O${eyes}O.`,
  `..O${mouth}O..`,
]

/** Lays `over` on `base`: its non-dot letters win. */
function merge(base: string, over: string): string {
  return Array.from(base)
    .map((ch, i) => (over[i] !== undefined && over[i] !== '.' ? over[i] : ch))
    .join('')
}

export type Mood = 'happy' | 'work' | 'sad' | 'sleep' | 'proud' | 'focus'

const SMALL_FRAMES: Record<Mood, readonly (readonly string[])[]> = {
  happy: [HEAD('KOOOOK', 'OPPO'), HEAD('KOOOOK', 'OPPO'), HEAD('KOOOOK', 'OPPO'), HEAD('DOOOOD', 'OPPO')],
  work: [HEAD('OKOOOK', 'OPPO'), HEAD('KOOOKO', 'OPPO'), HEAD('OKOOOK', 'OPPO'), HEAD('DOOOOD', 'OPPO')],
  sad: [HEAD('KOOOOK', 'ODDO', ['..........', '..........']).map((r, i) => (i === 3 ? '.TO' + r.slice(3) : r))],
  sleep: [HEAD('DOOOOD', 'OPPO', ['.........Z', '..........']), HEAD('DOOOOD', 'OPPO', ['........Z.', '.........Z'])],
  proud: [HEAD('KOOOOK', 'PPPP', ['Y........Y', '..........']), HEAD('KOOOOK', 'PPPP', ['.........Y', 'Y.........'])],
  focus: [HEAD('KOOOOK', 'ODDO')],
}

// ---------------------------------------------------------------- pane: 20 x 16

const BODY = [
  '...DD.........DD....',
  '...DOD.......DOD....',
  '...DOOD.....DOOD....',
  '...DOOODDDDDOOOD....',
  '..DOOOOOOOOOOOOOD...',
  '..DOO{e}OOOOO{e}OOD...',
  '..DOO{f}OOOOO{f}OOD...',
  '..DOOOOOO{n}OOOOOOD...',
  '...DOOOOO{m}OOOOOD....',
  '....DDOOOOOOODD.....',
  '....DOOOOOOOOOD.{t1}',
  '...DOOOOLLLOOOOD{t2}',
  '...DOOOLLLLLOOOD{t3}',
  '...DOOOLLLLLOOOOD...',
  '...DOOOOOOOOOOOD....',
  '....DDDODDDDODDD....',
]

type Face = { e: string; f: string; n: string; m: string; tail: 0 | 1 }

function big(face: Face, extra: Record<number, string> = {}): string[] {
  const tail = face.tail === 0 ? ['.DD', 'DOD', 'OD.'] : ['DD.', 'DOD', '.DO']
  return BODY.map((row, i) => {
    const out = row
      .replaceAll('{e}', face.e)
      .replaceAll('{f}', face.f)
      .replace('{n}', face.n)
      .replace('{m}', face.m)
      .replace('{t1}', tail[0]!)
      .replace('{t2}', tail[1]!)
      .replace('{t3}', tail[2]!)
    return extra[i] !== undefined ? merge(out.padEnd(20, '.'), extra[i]!) : out.padEnd(20, '.')
  })
}

const OPEN = { e: 'KK', f: 'KW' }
const SHUT = { e: 'OO', f: 'DD' }

const BIG_FRAMES: Record<Mood, readonly (readonly string[])[]> = {
  happy: [
    big({ ...OPEN, n: 'P', m: 'D', tail: 0 }),
    big({ ...OPEN, n: 'P', m: 'D', tail: 1 }),
    big({ ...OPEN, n: 'P', m: 'D', tail: 0 }),
    big({ ...SHUT, n: 'P', m: 'D', tail: 1 }),
  ],
  work: [
    big({ e: 'OK', f: 'KW', n: 'P', m: 'D', tail: 0 }, { 13: '...SSSSSSSSSS', 14: '...SGGGGGGGGS', 15: '...SSSSSSSSSS' }),
    big({ e: 'KO', f: 'WK', n: 'P', m: 'D', tail: 1 }, { 13: '...SSSSSSSSSS', 14: '...SGGGGGGGGS', 15: '...SSSSSSSSSS' }),
  ],
  sad: [big({ ...OPEN, n: 'P', m: 'D', tail: 0 }, { 7: '....T' }), big({ ...OPEN, n: 'P', m: 'D', tail: 0 }, { 8: '....T' })],
  sleep: [
    big({ ...SHUT, n: 'P', m: 'D', tail: 0 }, { 0: '.................Z..' }),
    big({ ...SHUT, n: 'P', m: 'D', tail: 0 }, { 0: '..................Z.', 1: '................Z...' }),
  ],
  proud: [
    big({ ...OPEN, n: 'P', m: 'P', tail: 1 }, { 0: 'Y.................Y.', 4: '..................Y.' }),
    big({ ...OPEN, n: 'P', m: 'P', tail: 0 }, { 1: '.Y.................Y', 5: 'Y...................' }),
  ],
  focus: [big({ e: 'KK', f: 'KK', n: 'P', m: 'D', tail: 0 })],
}

function pick<T>(frames: readonly T[], frame: number): T {
  return frames[((frame % frames.length) + frames.length) % frames.length]!
}

/** The band's cat, 10 x 4 pixels: 10 cells across, 2 rows. */
export function smallCat(mood: Mood, frame: number): Sprite {
  return sprite(pick(SMALL_FRAMES[mood], frame), PALETTE)
}

/** The pane's cat, 20 x 16 pixels: 20 cells across, 8 rows. */
export function bigCat(mood: Mood, frame: number): Sprite {
  return sprite(pick(BIG_FRAMES[mood], frame), PALETTE)
}

export function frames(mood: Mood, size: 'small' | 'big'): number {
  return (size === 'small' ? SMALL_FRAMES : BIG_FRAMES)[mood].length
}
