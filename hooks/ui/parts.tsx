// Shared drawing helpers: a row of styled parts, bars and the band's segments.
import type { ElementTable, RenderElement } from 'claude-code'

import type { TabFocus, TabGit, TabLive, TabTests, TabTodo, TabTurn, TabUsage } from '../../types'
import {
  bar,
  C,
  clock,
  compact,
  heat,
  limitLabel,
  money,
  percent,
  tokens,
  truncate,
  until,
} from '../lib/format'
import type { Part, Seg } from '../lib/layout'
import { SEPARATOR } from '../lib/layout'

export type El = ElementTable

/** One line of styled parts, cut at the end rather than wrapped. */
export function Line(el: El, parts: readonly Part[], key?: string): RenderElement {
  const { Text } = el
  return (
    <Text key={key} wrap="truncate-end">
      {parts.map(p => (
        <Text color={p.color} dimColor={p.dim} bold={p.bold}>
          {p.text}
        </Text>
      ))}
    </Text>
  )
}

/** A band row: the segments joined by the separator. */
export function joinSegs(segs: readonly Seg[]): Part[] {
  const out: Part[] = []
  segs.forEach((s, i) => {
    if (i > 0) out.push({ text: SEPARATOR })
    out.push(...s.parts)
  })
  return out
}

export function barParts(pct: number, width: number): Part[] {
  const b = bar(pct, width)
  return [
    { text: b.fill, color: heat(pct) },
    { text: b.rest, dim: true },
  ]
}

// ---------------------------------------------------------------- segments

export function ctxSeg(u: TabUsage | null, barWidth: number): Seg {
  if (u === null || u.percent === undefined) {
    return { id: 'ctx', rank: 10, parts: [{ text: 'ctx ', dim: true }, { text: '—', dim: true }] }
  }
  const pct = u.percent
  return {
    id: 'ctx',
    rank: 10,
    parts: [
      { text: 'ctx ', dim: true },
      ...barParts(pct, barWidth),
      { text: ` ${percent(pct)}`, color: heat(pct), bold: pct >= 85 },
    ],
  }
}

export function ctxTokensSeg(u: TabUsage | null): Seg | null {
  if (u === null || u.tokens === undefined) return null
  return { id: 'ctxTokens', rank: 2, parts: [{ text: `${tokens(u.tokens)}/${tokens(u.window)}`, dim: true }] }
}

export function compactHintSeg(u: TabUsage | null): Seg | null {
  if (u === null || (u.percent ?? 0) < 85) return null
  return { id: 'compact', rank: 9, parts: [{ text: '⚠ /compact', color: C.red, bold: true }] }
}

/** One segment per rate-limit window, its reset beside it when there is room. */
export function limitSegs(u: TabUsage | null, now: number, barWidth: number): Seg[] {
  if (u === null) return []
  const segs: Seg[] = []
  u.limits.forEach((l, i) => {
    const left = until(l.resetsAt, now)
    const isPrimary = l.kind === 'five_hour'
    segs.push({
      id: `limit:${l.kind}`,
      rank: isPrimary ? 8 : 7 - i * 0.1,
      parts: [
        { text: `${limitLabel(l.kind)} `, dim: true },
        ...(barWidth > 0 ? [...barParts(l.percent, barWidth), { text: ' ' }] : []),
        { text: percent(l.percent), color: heat(l.percent), bold: l.percent >= 85 },
      ],
    })
    if (left !== undefined) {
      segs.push({
        id: `reset:${l.kind}`,
        rank: isPrimary ? 4 : 1,
        parts: [{ text: `↻${compact(left)}`, dim: true }],
      })
    }
  })
  return segs
}

export function costSeg(u: TabUsage | null): Seg | null {
  if (u === null || u.costUsd === undefined || u.costUsd <= 0) return null
  return { id: 'cost', rank: 0, parts: [{ text: money(u.costUsd), dim: true }] }
}

export function gitSeg(g: TabGit | null): Seg | null {
  if (g === null) return null
  const parts: Part[] = [
    { text: '⎇ ', color: C.purple },
    { text: truncate(g.branch, 28), color: C.purple, bold: true },
  ]
  if (g.ahead > 0) parts.push({ text: ` ↑${g.ahead}`, color: C.green })
  if (g.behind > 0) parts.push({ text: ` ↓${g.behind}`, color: C.red })
  const dirty = g.staged + g.changed + g.untracked
  if (g.conflicts > 0) parts.push({ text: ` ✗${g.conflicts}`, color: C.red, bold: true })
  if (dirty > 0) parts.push({ text: ` ✚${dirty}`, color: C.yellow })
  if (dirty === 0 && g.conflicts === 0) parts.push({ text: ' ✓', color: C.green, dim: true })
  return { id: 'git', rank: 9, parts }
}

export function testsSeg(t: TabTests, now: number): Seg | null {
  if (t.status === 'none') return null
  if (t.status === 'running') {
    const spin = ['◐', '◓', '◑', '◒'][Math.floor(now / 1000) % 4]!
    return {
      id: 'tests',
      rank: 8,
      parts: [
        { text: `${spin} `, color: C.yellow },
        { text: `тесты ${compact(now - (t.startedAt ?? now))}`, color: C.yellow },
      ],
    }
  }
  if (t.status === 'pass') {
    const count = t.total !== undefined && t.total > 0 ? `${t.passed ?? t.total}/${t.total}` : 'ok'
    return { id: 'tests', rank: 8, parts: [{ text: '✓ ', color: C.green }, { text: count, color: C.green }] }
  }
  const failed = t.failed !== undefined && t.failed > 0 ? `${t.failed} упало` : 'упали'
  return { id: 'tests', rank: 8, parts: [{ text: '✗ ', color: C.red }, { text: failed, color: C.red, bold: true }] }
}

export function todoSegs(list: readonly TabTodo[], width: number): Seg[] {
  if (list.length === 0) return []
  const done = list.filter(t => t.done).length
  const next = list.find(t => !t.done)
  const segs: Seg[] = [
    {
      id: 'todo',
      rank: 6,
      parts: [
        { text: next === undefined ? '☑ ' : '☐ ', color: C.blue },
        { text: `${done}/${list.length}`, color: C.blue },
      ],
    },
  ]
  if (next !== undefined) {
    segs.push({ id: 'todoNext', rank: 2, parts: [{ text: truncate(next.text, Math.max(8, Math.min(32, width))), dim: true }] })
  }
  return segs
}

export function focusSeg(f: TabFocus | null, now: number, goalWidth: number): Seg | null {
  if (f === null) return null
  const elapsed = now - f.startedAt
  const parts: Part[] = [
    { text: '◎ ', color: C.accent },
    { text: truncate(f.goal, goalWidth), bold: true },
  ]
  if (f.minutes > 0 && f.isNotified) {
    parts.push({ text: ' · перерыв', color: C.green })
  } else if (f.minutes > 0) {
    parts.push({ text: ` ${minutesLeft(f.minutes * 60_000 - elapsed)}`, color: C.accent })
  } else {
    parts.push({ text: ` ${compact(elapsed)}`, dim: true })
  }
  return { id: 'focus', rank: 7, parts }
}

/** Whole minutes left, rounded up so a countdown never reads 0м early. */
export function minutesLeft(ms: number): string {
  const m = Math.ceil(Math.max(0, ms) / 60_000)
  return m >= 60 ? compact(m * 60_000) : `${m}м`
}

export function liveSeg(l: TabLive | null, now: number): Seg | null {
  if (l === null) return null
  const pulse = ['●', '◉', '○', '◉'][Math.floor(now / 1000) % 4]!
  const parts: Part[] = [
    { text: `${pulse} `, color: C.accent },
    { text: compact(now - l.startedAt), bold: true },
  ]
  if (l.tools > 0) parts.push({ text: ` · ${l.tools} инстр`, dim: true })
  if (l.errors > 0) parts.push({ text: ` · ${l.errors} ош`, color: C.red })
  return { id: 'live', rank: 10, parts }
}

export function lastTurnSeg(last: TabTurn | undefined, count: number): Seg | null {
  if (last === undefined) return null
  const parts: Part[] = [{ text: `◷ ход ${count} · ${compact(last.ms)}`, dim: true }]
  if (last.tools > 0) parts.push({ text: ` · ${last.tools} инстр`, dim: true })
  if (last.errors > 0) parts.push({ text: ` · ${last.errors} ош`, color: C.red, dim: true })
  return { id: 'turn', rank: 3, parts }
}

export function countdown(f: TabFocus, now: number): string {
  if (f.minutes === 0) return clock(now - f.startedAt)
  return clock(Math.max(0, f.minutes * 60_000 - (now - f.startedAt)))
}
