import { cells } from './format'

/** One run of styled text. */
export type Part = { text: string; color?: string; dim?: boolean; bold?: boolean }

/** One item of a band row; the lowest `rank` is dropped first when room runs out. */
export type Seg = { id: string; rank: number; parts: Part[] }

export const SEPARATOR = '  '

export function segWidth(seg: Seg): number {
  return seg.parts.reduce((sum, p) => sum + cells(p.text), 0)
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
