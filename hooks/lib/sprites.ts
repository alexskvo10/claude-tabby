// Tabby in pixels. Letters are palette keys, '.' is transparent:
//   O fur   D outline   L light belly   K eye   W eye shine   P nose/pink
//   Z, z sleep   T tear   Y sparkle   S screen   G screen glow
//   E darker fur (a shut eye)   B blush   R inner ear
//   H heart   X laptop lid   N its edge
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
  E: rgb('#B9663F'),
  B: rgb('#F3A0A8'),
  R: rgb('#F4A3B5'),
  z: rgb('#7C8DB0'),
  H: rgb('#FF6F91'),
  X: rgb('#56607A'),
  N: rgb('#2F3542'),
}

// ---------------------------------------------------------------- band: 11 x 6
//
// A round face in three terminal rows: pink-lined ears, eyes with a shine,
// blush, a small nose over a light muzzle. Two columns on the right hold the
// sleepy z and the sparkles, so every frame keeps one size.

/** Lays `over` on `base`: its non-dot letters win. */
function merge(base: string, over: string): string {
  return Array.from(base)
    .map((ch, i) => (over[i] !== undefined && over[i] !== '.' ? over[i] : ch))
    .join('')
}

const FACE = [
  '.O.....O...',
  'OPO...OPO..',
  'OOOOOOOOO..',
  'O{e}OOO{e}O..',
  'BOOOPOOOB..',
  '.OOLLLOO...',
]

/** The face with its eyes (two pixels each) and overlays by row. */
function head(eyes: string, extra: Record<number, string> = {}): string[] {
  return FACE.map((row, i) => {
    const out = row.replaceAll('{e}', eyes)
    return extra[i] !== undefined ? merge(out, extra[i]!) : out
  })
}

const EYES_OPEN = 'KW'
const EYES_LEFT = 'WK'
const EYES_SHUT = 'EE'

export type Mood = 'happy' | 'work' | 'sad' | 'sleep' | 'proud' | 'focus'

// Purring: eyes shut in a smile, ^ ^, and now and then a heart by the ear.
const SMILE = { 2: '..D...D....', 3: '.D.D.D.D...' }
const HEART = { 0: '........H.H', 1: '.........H.' }

// Working: peeking over an open laptop seen from behind (its lid, a glowing
// mark), eyes reading along the lines, a paw on each corner tapping in turn.
const LID_A = '.LXXXXXXX..'
const LID_B = '.XXXXXXXL..'
const LID = '.XXXXGXXX..'

const SMALL_FRAMES: Record<Mood, readonly (readonly string[])[]> = {
  // the anim shows the heart for a moment now and then
  happy: [head('OO', SMILE), head('OO', { ...SMILE, ...HEART })],
  work: [
    head(EYES_OPEN, { 4: LID_A, 5: LID }),
    head(EYES_OPEN, { 4: LID_B, 5: LID }),
    head(EYES_LEFT, { 4: LID_A, 5: LID }),
    head(EYES_LEFT, { 4: LID_B, 5: LID }),
  ],
  sad: [head(EYES_OPEN, { 4: '.T....T....' }), head(EYES_OPEN, { 5: '.T....T....' })],
  sleep: [
    head(EYES_SHUT, { 0: '.........z.' }),
    head(EYES_SHUT, { 0: '..........Z', 1: '.........z.' }),
    head(EYES_SHUT, { 0: '.........Z.', 1: '..........z' }),
  ],
  proud: [head(EYES_OPEN, { 0: 'Y.........Y', 2: '..........Y' }), head(EYES_OPEN, { 1: '.........Y.', 3: '..........Y' })],
  focus: [head(EYES_OPEN)],
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
  '....DOOOOOOOOOD.....',
  '...DOOOOLLLOOOOD....',
  '...DOOOLLLLLOOOD....',
  '...DOOOLLLLLOOOOD...',
  '...DOOOOOOOOOOOD....',
  '....DDDODDDDODDD....',
]

// The tail rises from the hip and swishes: upright, curled right, hooked low.
// Rows 9-14, right of the hip; its root stays put so it swings, not jumps.
const TAILS = {
  up: { 9: '.................D', 10: '................DOD', 11: '................DOD', 12: '................DOD', 13: '.................OD', 14: '................DD' },
  right: { 9: '..................DD', 10: '.................DOD', 11: '................DOD.', 12: '................DOD', 13: '.................OD', 14: '................DD' },
  hook: { 10: '.................DDD', 11: '................DOOD', 12: '................DODD', 13: '.................OD', 14: '................DD' },
} satisfies Record<string, Record<number, string>>

type Face = { e: string; f: string; n: string; m: string; tail: keyof typeof TAILS }

function big(face: Face, extra: Record<number, string> = {}): string[] {
  const tail: Record<number, string> = TAILS[face.tail]
  return BODY.map((row, i) => {
    let out = row
      .replaceAll('{e}', face.e)
      .replaceAll('{f}', face.f)
      .replace('{n}', face.n)
      .replace('{m}', face.m)
      .padEnd(20, '.')
    if (tail[i] !== undefined) out = merge(out, tail[i]!)
    return extra[i] !== undefined ? merge(out, extra[i]!) : out
  })
}

const OPEN = { e: 'KK', f: 'KW' }

/** The back of an open laptop's lid, a glowing mark in its middle. */
const LAPTOP_BIG: Record<number, string> = {
  11: '..XXXXXXXXXXXXXX....',
  12: '..XXXXXXGGXXXXXX....',
  13: '..XXXXXXGGXXXXXX....',
  14: '..XXXXXXXXXXXXXX....',
  15: '..NNNNNNNNNNNNNN....',
}
const SHUT = { e: 'OO', f: 'DD' }

const BIG_FRAMES: Record<Mood, readonly (readonly string[])[]> = {
  // the tail swishes up, right, hooked, right; the last frame is the blink
  happy: [
    big({ ...OPEN, n: 'P', m: 'D', tail: 'up' }),
    big({ ...OPEN, n: 'P', m: 'D', tail: 'right' }),
    big({ ...OPEN, n: 'P', m: 'D', tail: 'hook' }),
    big({ ...OPEN, n: 'P', m: 'D', tail: 'right' }),
    big({ ...SHUT, n: 'P', m: 'D', tail: 'up' }),
  ],
  // over the lid of an open laptop: one paw rests on its edge, the other taps
  work: [
    big({ e: 'OK', f: 'KW', n: 'P', m: 'D', tail: 'up' }, { ...LAPTOP_BIG, 10: '..NNLLNNNNNNLLNN....' }),
    big({ e: 'KO', f: 'WK', n: 'P', m: 'D', tail: 'right' }, { ...LAPTOP_BIG, 9: '....LL..............', 10: '..NNNNNNNNNNLLNN....' }),
  ],
  sad: [big({ ...OPEN, n: 'P', m: 'D', tail: 'up' }, { 7: '....T' }), big({ ...OPEN, n: 'P', m: 'D', tail: 'up' }, { 8: '....T' })],
  sleep: [
    big({ ...SHUT, n: 'P', m: 'D', tail: 'up' }, { 0: '.................Z..' }),
    big({ ...SHUT, n: 'P', m: 'D', tail: 'up' }, { 0: '..................Z.', 1: '................Z...' }),
  ],
  proud: [
    big({ ...OPEN, n: 'P', m: 'P', tail: 'right' }, { 0: 'Y.................Y.', 4: '..................Y.' }),
    big({ ...OPEN, n: 'P', m: 'P', tail: 'up' }, { 1: '.Y.................Y', 5: 'Y...................' }),
  ],
  focus: [big({ e: 'KK', f: 'KK', n: 'P', m: 'D', tail: 'up' })],
}

function pick<T>(frames: readonly T[], frame: number): T {
  return frames[((frame % frames.length) + frames.length) % frames.length]!
}

/** The band's cat, 11 x 6 pixels: 11 cells across, 3 rows. */
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
