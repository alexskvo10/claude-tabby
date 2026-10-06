// Tabby in pixels. Letters are palette keys, '.' is transparent:
//   O fur   D outline   L light belly   K eye   W eye shine   P nose/pink
//   Z, z sleep   T tear   Y sparkle   S screen   G screen glow
//   E darker fur (a shut eye)   B blush   R inner ear
//   H heart   X laptop lid   N keyboard
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

// Working: a laptop under the chin, eyes reading along the lines, paws typing.
const LAPTOP = '.XXXXGXXX..'
const PAWS_A = '.LNNNNNL...'
const PAWS_B = '.NLNNNLN...'

const SMALL_FRAMES: Record<Mood, readonly (readonly string[])[]> = {
  // the anim shows the heart for a moment now and then
  happy: [head('OO', SMILE), head('OO', { ...SMILE, ...HEART })],
  work: [
    head(EYES_OPEN, { 4: LAPTOP, 5: PAWS_A }),
    head(EYES_OPEN, { 4: LAPTOP, 5: PAWS_B }),
    head(EYES_LEFT, { 4: LAPTOP, 5: PAWS_A }),
    head(EYES_LEFT, { 4: LAPTOP, 5: PAWS_B }),
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
