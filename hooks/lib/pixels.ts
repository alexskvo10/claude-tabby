// Pixel art for the terminal: two square pixels per cell, the upper half
// block (▀) painted in the top pixel's colour over the bottom one's. Works in
// any truecolor terminal, Windows Terminal included; packs into the cells a
// `Raster` element takes.

/** 0xRRGGBB, or `DEFAULT` for the terminal's own colour (transparent). */
export type Rgb = number

export const DEFAULT = 0x01000000

export type Sprite = { w: number; h: number; px: (Rgb | null)[] }

export function rgb(hex: string): Rgb {
  return parseInt(hex.replace('#', '').slice(0, 6), 16)
}

export function css(c: Rgb): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

/** Mixes two colours, `t` from 0 (all `a`) to 1 (all `b`). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t))
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** A colour along stops spread evenly over 0..1. */
export function along(stops: readonly Rgb[], t: number): Rgb {
  if (stops.length === 1) return stops[0]!
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return mix(stops[i]!, stops[i + 1]!, x - i)
}

/** Rows of letters, each a palette key; a key missing from the palette is transparent. */
export function sprite(rows: readonly string[], palette: Readonly<Record<string, Rgb>>): Sprite {
  const w = Math.max(...rows.map(r => r.length))
  const px: (Rgb | null)[] = []
  for (const row of rows) {
    for (let x = 0; x < w; x += 1) px.push(palette[row[x] ?? '.'] ?? null)
  }
  return { w, h: rows.length, px }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64, with no reliance on the environment's own. */
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : B64[c & 63]
  }
  return out
}

export type Cells = { columns: number; rows: number; cells: string }

/** One cell: a width-1 character, its colour and its background. */
export type Cell = { ch: string; fg: Rgb; bg: Rgb }

export function pack(grid: readonly Cell[], columns: number): Cells {
  const words = new Uint32Array(grid.length * 3)
  grid.forEach((c, i) => {
    words[i * 3] = c.ch.codePointAt(0) ?? 32
    words[i * 3 + 1] = c.fg
    words[i * 3 + 2] = c.bg
  })
  return { columns, rows: Math.ceil(grid.length / columns), cells: base64(new Uint8Array(words.buffer)) }
}

/** A sprite as cells: pixel rows paired top and bottom into half blocks. */
export function toCells(s: Sprite): Cells {
  const rows = Math.ceil(s.h / 2)
  const grid: Cell[] = []
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < s.w; x += 1) {
      const top = s.px[2 * y * s.w + x] ?? null
      const bottom = 2 * y + 1 < s.h ? (s.px[(2 * y + 1) * s.w + x] ?? null) : null
      if (top === null && bottom === null) grid.push({ ch: ' ', fg: DEFAULT, bg: DEFAULT })
      else if (top === null) grid.push({ ch: '▄', fg: bottom!, bg: DEFAULT })
      else if (bottom === null) grid.push({ ch: '▀', fg: top, bg: DEFAULT })
      else if (top === bottom) grid.push({ ch: '█', fg: top, bg: DEFAULT })
      else grid.push({ ch: '▀', fg: top, bg: bottom })
    }
  }
  return pack(grid, s.w)
}

/**
 * A ring gauge `size` pixels across, filled clockwise from the top to `pct`;
 * the filled arc runs through `stops` as it goes, the rest in `track`. The
 * band is `band` pixels deep at any size, so the hole stays round.
 */
export function ring(pct: number, size: number, stops: readonly Rgb[], track: Rgb, band = 2.6): Sprite {
  const c = (size - 1) / 2
  const outer = size / 2 - 0.15
  const inner = outer - band
  const angles: (number | null)[] = []
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - c
      const dy = y - c
      const d = Math.sqrt(dx * dx + dy * dy)
      // clockwise from twelve o'clock, 0..1
      angles.push(d > outer || d < inner ? null : (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1)
    }
  }
  // any use at all shows: at least the column at twelve o'clock, all its depth
  const top = Math.ceil(c)
  const first = Math.max(...angles.filter((a, i) => a !== null && i % size === top && i < size * c) as number[])
  const fill = pct <= 0 ? -1 : Math.max(first, Math.min(100, pct) / 100)
  return { w: size, h: size, px: angles.map(a => (a === null ? null : a <= fill ? along(stops, a) : track)) }
}

// ---------------------------------------------------------------- heat map

/**
 * Days as 2 x 2 pixel squares with a pixel between them, `perRow` to a row,
 * each in `colorOf` its value.
 */
export function squares(values: readonly number[], perRow: number, colorOf: (v: number) => Rgb): Sprite {
  const rows = Math.ceil(values.length / perRow)
  const w = perRow * 3 - 1
  const h = rows * 3 - 1
  const px: (Rgb | null)[] = new Array(w * h).fill(null)
  values.forEach((v, i) => {
    const x0 = (i % perRow) * 3
    const y0 = Math.floor(i / perRow) * 3
    const c = colorOf(v)
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) px[(y0 + dy) * w + x0 + dx] = c
  })
  return { w, h, px }
}

// ---------------------------------------------------------------- big digits

const GLYPHS: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ':': ['.', '#', '.', '#', '.'],
  ' ': ['.', '.', '.', '.', '.'],
}

/** Text in a 3 x 5 pixel font (digits, ':' and space), one pixel between glyphs. */
export function bigText(text: string, color: Rgb): Sprite {
  const rows = ['', '', '', '', '']
  Array.from(text).forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[' ']!
    for (let y = 0; y < 5; y += 1) rows[y] += (i > 0 ? '.' : '') + g[y]!
  })
  // a sixth, empty row so the five pixel rows fill three whole cells
  rows.push('.'.repeat(rows[0]!.length))
  return sprite(rows, { '#': color })
}
