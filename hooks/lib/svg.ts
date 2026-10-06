// The same pictures for the desktop, VS Code and the phone, which draw no
// terminal cells but do draw SVG: the pixel cat (its frames played by SMIL,
// so it moves with no repaint from us), ring gauges, the activity squares and
// the focus clock.
import type { Rgb, Sprite } from './pixels'
import { css } from './pixels'

const NS = 'xmlns="http://www.w3.org/2000/svg"'

/** One rect per run of a colour along a row, every pixel `scale` units. */
function rects(s: Sprite, scale: number): string {
  let out = ''
  for (let y = 0; y < s.h; y += 1) {
    let x = 0
    while (x < s.w) {
      const c = s.px[y * s.w + x] ?? null
      let end = x + 1
      while (end < s.w && (s.px[y * s.w + end] ?? null) === c) end += 1
      if (c !== null) out += `<rect x="${x * scale}" y="${y * scale}" width="${(end - x) * scale}" height="${scale}" fill="${css(c)}"/>`
      x = end
    }
  }
  return out
}

export type Step = { sprite: Sprite; ms: number }

/**
 * Pixel art; given several steps, an endless loop of them, each shown for its
 * `ms`. Only one step's group is visible at a time.
 */
export function pixelSvg(steps: readonly Step[], scale: number): string {
  const first = steps[0]!.sprite
  const w = first.w * scale
  const h = first.h * scale
  // in the desktop's sandboxed frame a colour scheme unlike the app's paints
  // the frame white; following the user's keeps it transparent
  const head = `<svg ${NS} viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" style="color-scheme: light dark; background: transparent">`
  if (steps.length === 1) return `${head}${rects(first, scale)}</svg>`
  const total = steps.reduce((sum, s) => sum + s.ms, 0)
  let at = 0
  let body = ''
  for (const step of steps) {
    const from = at / total
    const to = (at + step.ms) / total
    at += step.ms
    // discrete: each value holds from its key time to the next
    const keys: [number, string][] = []
    if (from > 0) keys.push([0, 'hidden'])
    keys.push([from, 'visible'])
    if (to < 1) keys.push([to, 'hidden'])
    const values = keys.map(k => k[1]).join(';')
    const times = keys.map(k => +k[0].toFixed(4)).join(';')
    const anim = `<animate attributeName="visibility" values="${values}" keyTimes="${times}" dur="${total}ms" calcMode="discrete" repeatCount="indefinite"/>`
    body += `<g visibility="${from === 0 ? 'visible' : 'hidden'}">${anim}${rects(step.sprite, scale)}</g>`
  }
  return `${head}${body}</svg>`
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const FONT = `font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700"`

/** A ring gauge: the track, the filled arc from twelve o'clock, the figure inside. */
export function ringSvg(pct: number, size: number, color: Rgb, track: Rgb, label: string, labelColor: Rgb): string {
  const stroke = size * 0.13
  const r = (size - stroke) / 2
  const c = size / 2
  const len = 2 * Math.PI * r
  const fill = (Math.min(100, Math.max(0, pct)) / 100) * len
  return (
    `<svg ${NS} viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${css(track)}" stroke-width="${stroke}"/>` +
    (fill > 0
      ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${css(color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${fill.toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`
      : '') +
    `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-size="${(size * 0.24).toFixed(1)}" ${FONT} fill="${css(labelColor)}">${esc(label)}</text>` +
    `</svg>`
  )
}

/** Days as rounded squares, `perRow` to a row. */
export function squaresSvg(values: readonly number[], perRow: number, colorOf: (v: number) => Rgb, cell: number): string {
  const gap = Math.round(cell / 4)
  const rows = Math.ceil(values.length / perRow)
  const w = perRow * cell + (perRow - 1) * gap
  const h = rows * cell + (rows - 1) * gap
  const body = values
    .map((v, i) => {
      const x = (i % perRow) * (cell + gap)
      const y = Math.floor(i / perRow) * (cell + gap)
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${(cell / 5).toFixed(1)}" fill="${css(colorOf(v))}"/>`
    })
    .join('')
  return `<svg ${NS} viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`
}

/** Large figures, for the focus clock. */
export function bigTextSvg(text: string, color: Rgb, height: number): string {
  const w = Math.ceil(Array.from(text).length * height * 0.62)
  return (
    `<svg ${NS} viewBox="0 0 ${w} ${height}" width="${w}" height="${height}">` +
    `<text x="0" y="${(height * 0.85).toFixed(1)}" font-size="${height}" ${FONT} fill="${css(color)}">${esc(text)}</text>` +
    `</svg>`
  )
}
