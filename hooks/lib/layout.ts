import { cells } from './format'

/** One run of styled text; with `press`, a button drawn as that text. */
export type Part = {
  text: string
  color?: string
  dim?: boolean
  bold?: boolean
  press?: () => void
  /** the colour the pressable text lights in under the pointer */
  hoverColor?: string
}

/**
 * One item of a band row; the lowest `rank` is dropped first when room runs
 * out. `card` is the line shown over the other row while the pointer is on it.
 */
export type Seg = { id: string; rank: number; parts: Part[]; card?: Part[] }

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

/** Drops the lowest-ranked segments until the row fits `width`; keeps order. */
export function fit(segs: readonly Seg[], width: number): Seg[] {
  const kept = segs.filter(s => segWidth(s) > 0)
  while (kept.length > 0 && rowWidth(kept) > width) {
    let lowest = 0
    for (let i = 1; i < kept.length; i += 1) {
      if (kept[i]!.rank < kept[lowest]!.rank) lowest = i
    }
    kept.splice(lowest, 1)
  }
  return kept
}
