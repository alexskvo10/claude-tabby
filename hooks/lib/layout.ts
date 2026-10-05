import { cells } from './format'

/** One run of styled text; with `press`, a button drawn as that text. */
export type Part = {
  text: string
  color?: string
  dim?: boolean
  bold?: boolean
  bg?: string
  press?: () => void
  /** the colour the pressable text lights in under the pointer */
  hoverColor?: string
}

/**
 * One item of a band row; the lowest `rank` is dropped first when room runs
 * out. `card` is the line shown over the other row while the pointer is on it.
 */
export type Seg = { id: string; rank: number; parts: Part[]; card?: Part[]; group?: string }

export const SEPARATOR = '  '

export function partsWidth(parts: readonly Part[]): number {
  return parts.reduce((sum, p) => sum + cells(p.text), 0)
}

export function segWidth(seg: Seg): number {
  return partsWidth(seg.parts)
}

export function rowWidth(segs: readonly Seg[]): number {
  if (segs.length === 0) return 0
  return segs.reduce((sum, s) => sum + segWidth(s), 0) + cells(SEPARATOR) * (segs.length - 1)
}

/** The segments in groups: neighbours sharing a group sit together. */
export function groups(segs: readonly Seg[]): Seg[][] {
  const out: Seg[][] = []
  for (const s of segs) {
    const last = out.at(-1)
    if (last !== undefined && s.group !== undefined && last[0]!.group === s.group) last.push(s)
    else out.push([s])
  }
  return out
}

/** Between groups of a row: a thin rule with room either side. */
export const GROUP_GAP = ' │ '

/** A row's width as groups: one space inside a group, the rule between groups. */
export function groupedWidth(segs: readonly Seg[]): number {
  const gs = groups(segs)
  if (gs.length === 0) return 0
  return gs.reduce((sum, g) => sum + g.reduce((s, x) => s + segWidth(x), 0) + (g.length - 1), 0) + GROUP_GAP.length * (gs.length - 1)
}

/** Drops the lowest-ranked segments until the row fits `width`; keeps order. */
export function fit(segs: readonly Seg[], width: number, measure: (segs: readonly Seg[]) => number = rowWidth): Seg[] {
  const kept = segs.filter(s => segWidth(s) > 0)
  while (kept.length > 0 && measure(kept) > width) {
    let lowest = 0
    for (let i = 1; i < kept.length; i += 1) {
      if (kept[i]!.rank < kept[lowest]!.rank) lowest = i
    }
    kept.splice(lowest, 1)
  }
  return kept
}
