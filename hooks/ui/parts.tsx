// Shared drawing: styled runs, bars, and the band's segments with their cards.
import type { ElementTable, RenderElement } from 'claude-code'

import type { TabFocus, TabGit, TabLimitSample, TabLive, TabPlanItem, TabTests, TabTodo, TabTurn, TabUsage } from '../../types'
import {
  bar,
  C,
  compact,
  duration,
  heat,
  limitLabel,
  minutesLeft,
  money,
  percent,
  timeOfDay,
  tokens,
  truncate,
  until,
} from '../lib/format'
import { burn, contextGrowth, turnsLeft } from '../lib/forecast'
import { L } from '../lib/i18n'
import type { Part, Seg } from '../lib/layout'
import { SEPARATOR } from '../lib/layout'
import type { Handlers } from '../snapshot'

export type El = ElementTable

/** Runs of text in a row; a run with `press` is a plain button. */
export function Runs(el: El, parts: readonly Part[], key: string): RenderElement[] {
  const { Text, Button } = el
  return parts.map((p, i) =>
    p.press !== undefined ? (
      <Button
        key={`${key}-${i}`}
        label={p.text}
        plain
        {...(p.dim === true ? { dimColor: true } : {})}
        hover={{ scope: `${key}-${i}`, underline: true, dimColor: false, ...(p.hoverColor !== undefined ? { color: p.hoverColor } : {}) }}
        onPress={() => p.press?.()}
      />
    ) : (
      <Text color={p.color} dimColor={p.dim} bold={p.bold} wrap="truncate-end">
        {p.text}
      </Text>
    ),
  )
}

/** One line of styled text, cut at the end rather than wrapped. */
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

/** A bar coloured by how full it is, or in one colour for progress. */
export function barParts(pct: number, width: number, color?: string): Part[] {
  const b = bar(pct, width)
  return [
    { text: b.fill, color: color ?? heat(pct) },
    { text: b.rest, dim: true },
  ]
}

const sep: Part = { text: SEPARATOR }

/** Segments joined by the separator, as plain parts (for one-line drawings). */
export function joinSegs(segs: readonly Seg[]): Part[] {
  const out: Part[] = []
  segs.forEach((s, i) => {
    if (i > 0) out.push(sep)
    out.push(...s.parts)
  })
  return out
}

// ---------------------------------------------------------------- segments

export function ctxSeg(u: TabUsage | null, history: readonly TabTurn[], barWidth: number, on: Handlers): Seg {
  const label: Part = { text: 'ctx', dim: true, press: () => on.open('overview'), hoverColor: C.accent }
  if (u === null || u.percent === undefined) {
    return { id: 'ctx', rank: 10, parts: [label, { text: ' —', dim: true }], card: [{ text: L.card.contextFresh, dim: true }] }
  }
  const pct = u.percent
  const growth = contextGrowth(history)
  const left = turnsLeft(u.tokens, u.window, growth)
  const card: Part[] = [{ text: L.card.context(tokens(u.tokens ?? 0), tokens(u.window), Math.round(pct)) }]
  if (growth !== undefined && left !== undefined) card.push({ text: L.card.contextGrowth(tokens(growth), left), dim: true })
  return {
    id: 'ctx',
    rank: 10,
    parts: [
      label,
      { text: ' ' },
      ...barParts(pct, barWidth),
      { text: ` ${percent(pct)}`, color: heat(pct), bold: pct >= 85 },
    ],
    card,
  }
}

/** "≈6 turns" beside the context bar, once the pace is known and it matters. */
export function ctxLeftSeg(u: TabUsage | null, history: readonly TabTurn[]): Seg | null {
  if (u === null || u.percent === undefined || u.percent < 40) return null
  const left = turnsLeft(u.tokens, u.window, contextGrowth(history))
  if (left === undefined || left > 30) return null
  return { id: 'ctxLeft', rank: 6, parts: [{ text: L.band.turnsLeft(left), color: left <= 5 ? C.red : C.yellow }] }
}

export function ctxTokensSeg(u: TabUsage | null): Seg | null {
  if (u === null || u.tokens === undefined) return null
  return { id: 'ctxTokens', rank: 2, parts: [{ text: `${tokens(u.tokens)}/${tokens(u.window)}`, dim: true }] }
}

export function compactHintSeg(u: TabUsage | null): Seg | null {
  if (u === null || (u.percent ?? 0) < 85) return null
  return { id: 'compact', rank: 9, parts: [{ text: '⚠ /compact', color: C.red, bold: true }] }
}

/** One segment per rate-limit window, with its reset and, when it will run out first, a warning. */
export function limitSegs(
  u: TabUsage | null,
  samples: readonly TabLimitSample[],
  now: number,
  barWidth: number,
  on: Handlers,
): Seg[] {
  if (u === null) return []
  const segs: Seg[] = []
  u.limits.forEach((l, i) => {
    const left = until(l.resetsAt, now)
    const b = burn(samples, l.kind, now, left)
    const isPrimary = l.kind === 'five_hour'
    const label = limitLabel(l.kind)
    const card: Part[] = [{ text: L.card.limit(label, Math.round(l.percent)) }]
    if (left !== undefined && l.resetsAt !== undefined) {
      card.push({ text: L.card.resets(timeOfDay(Date.parse(l.resetsAt), now), duration(left)), dim: true })
    }
    if (b !== undefined && b.perHour > 0) {
      card.push({ text: L.card.rate(b.perHour.toFixed(1)), dim: true })
      card.push(
        b.runsOutInMs !== undefined
          ? { text: L.card.notEnough(duration(b.runsOutInMs)), color: C.red }
          : { text: L.card.enough, color: C.green },
      )
    }
    segs.push({
      id: `limit:${l.kind}`,
      rank: isPrimary ? 8 : 7 - i * 0.1,
      parts: [
        { text: label, dim: true, press: () => on.open('overview'), hoverColor: C.accent },
        { text: ' ' },
        ...(barWidth > 0 ? [...barParts(l.percent, barWidth), { text: ' ' }] : []),
        { text: percent(l.percent), color: heat(l.percent), bold: l.percent >= 85 },
      ],
      card,
    })
    if (b?.runsOutInMs !== undefined) {
      segs.push({
        id: `pace:${l.kind}`,
        rank: isPrimary ? 8.5 : 7.5,
        parts: [{ text: `⚠ ${L.band.runsOut(compact(b.runsOutInMs))}`, color: C.red }],
        card,
      })
    } else if (left !== undefined) {
      // a space after the arrow: Windows Terminal's font draws it wider than a cell
      segs.push({ id: `reset:${l.kind}`, rank: isPrimary ? 4 : 1, parts: [{ text: `↻ ${compact(left)}`, dim: true }], card })
    }
  })
  return segs
}

export function costSeg(u: TabUsage | null, history: readonly TabTurn[], on: Handlers): Seg | null {
  if (u === null || u.costUsd === undefined || u.costUsd <= 0) return null
  const costs = history.map(t => t.costUsd).filter((c): c is number => c !== undefined)
  const avg = costs.length > 0 ? costs.reduce((s, c) => s + c, 0) / costs.length : undefined
  return {
    id: 'cost',
    rank: 0,
    parts: [{ text: money(u.costUsd), dim: true, press: () => on.open('overview'), hoverColor: C.accent }],
    card: [{ text: L.card.cost(money(u.costUsd), avg !== undefined ? money(avg) : '—') }],
  }
}

export function gitSeg(g: TabGit | null, on: Handlers): Seg | null {
  if (g === null) return null
  const parts: Part[] = [
    { text: '⎇ ', color: C.purple },
    { text: truncate(g.branch, 28), press: () => on.open('git'), hoverColor: C.purple },
  ]
  if (g.ahead > 0) parts.push({ text: ` ↑${g.ahead}`, color: C.green })
  if (g.behind > 0) parts.push({ text: ` ↓${g.behind}`, color: C.red })
  const dirty = g.staged + g.changed + g.untracked
  if (g.conflicts > 0) parts.push({ text: ` ✗${g.conflicts}`, color: C.red, bold: true })
  if (dirty > 0) parts.push({ text: ` ✚${dirty}`, color: C.yellow })
  if (dirty === 0 && g.conflicts === 0) parts.push({ text: ' ✓', color: C.green, dim: true })
  if (g.pr !== null) {
    const { passed, failed, pending } = g.pr.checks
    const mark = failed > 0 ? { text: '✗', color: C.red } : pending > 0 ? { text: '⋯', color: C.yellow } : passed > 0 ? { text: '✓', color: C.green } : { text: '' }
    parts.push({ text: ` #${g.pr.number}`, color: C.blue }, { ...mark, text: mark.text === '' ? '' : ` ${mark.text}` })
  }
  const card: Part[] = [{ text: L.card.git(dirty) }]
  if (g.pr !== null) card.push({ text: ` · PR #${g.pr.number} ${truncate(g.pr.title, 40)}`, dim: true })
  return { id: 'git', rank: 9, parts: parts.filter(p => p.text !== ''), card }
}

export function testsSeg(t: TabTests, now: number, on: Handlers): Seg | null {
  if (t.status === 'none') return null
  if (t.status === 'running') {
    const spin = ['◐', '◓', '◑', '◒'][Math.floor(now / 1000) % 4]!
    return {
      id: 'tests',
      rank: 8,
      parts: [
        { text: `${spin} `, color: C.yellow },
        { text: `${L.band.testsRunning} ${compact(now - (t.startedAt ?? now))}`, color: C.yellow },
      ],
    }
  }
  if (t.status === 'pass') {
    const count = t.total !== undefined && t.total > 0 ? `${t.passed ?? t.total}/${t.total}` : 'ok'
    return {
      id: 'tests',
      rank: 8,
      parts: [{ text: '✓ ', color: C.green }, { text: count, press: () => on.runTests(), hoverColor: C.green }],
      card: [{ text: L.card.testsPass }],
    }
  }
  const failed = t.failed !== undefined && t.failed > 0 ? L.band.failed(t.failed) : L.band.failedAny
  return {
    id: 'tests',
    rank: 8,
    parts: [{ text: '✗ ', color: C.red }, { text: failed, press: () => on.askToFix(), hoverColor: C.red }],
    card: [{ text: L.card.tests }, ...(t.failures.length > 0 ? [{ text: `: ${truncate(t.failures.join(', '), 80)}`, dim: true }] : [])],
  }
}

export function planSeg(plan: readonly TabPlanItem[], width: number, on: Handlers): Seg | null {
  if (plan.length === 0 || plan.every(p => p.status === 'completed')) return null
  const done = plan.filter(p => p.status === 'completed').length
  const active = plan.find(p => p.status === 'in_progress')
  const parts: Part[] = [
    { text: '▸ ', color: C.cyan },
    { text: `${L.band.plan} ${done}/${plan.length}`, color: C.cyan, press: () => on.open('tasks'), hoverColor: C.cyan },
  ]
  if (active !== undefined) parts.push({ text: ` ${truncate(active.active || active.text, Math.max(8, width))}`, dim: true })
  return { id: 'plan', rank: 7.5, parts, card: [{ text: L.card.plan(done, plan.length) }] }
}

export function todoSegs(list: readonly TabTodo[], width: number, on: Handlers): Seg[] {
  if (list.length === 0) return []
  const done = list.filter(t => t.done).length
  const open = list.filter(t => !t.done)
  const next = open.find(t => t.isHigh === true) ?? open[0]
  const segs: Seg[] = [
    {
      id: 'todo',
      rank: 6,
      parts: [
        { text: next === undefined ? '☑ ' : '☐ ', color: C.blue },
        { text: `${done}/${list.length}`, color: C.blue, press: () => on.open('tasks'), hoverColor: C.blue },
      ],
      card: [{ text: L.card.todo }],
    },
  ]
  if (next !== undefined && width > 0) {
    segs.push({
      id: 'todoNext',
      rank: 2,
      parts: [
        ...(next.isHigh === true ? [{ text: '! ', color: C.red, bold: true }] : []),
        { text: truncate(next.text, Math.max(8, Math.min(32, width))), dim: true, press: () => on.open('tasks') },
      ],
      card: [{ text: L.card.todo }],
    })
  }
  return segs
}

export function focusSeg(f: TabFocus | null, now: number, goalWidth: number, on: Handlers): Seg | null {
  if (f === null) return null
  const elapsed = now - f.startedAt
  const parts: Part[] = [
    { text: '◎ ', color: C.accent },
    { text: truncate(f.goal, goalWidth), press: () => on.open('tasks'), hoverColor: C.accent },
  ]
  const left = minutesLeft(f.minutes * 60_000 - elapsed)
  if (f.minutes > 0 && f.isNotified) parts.push({ text: ` · ${L.band.breakTime}`, color: C.green })
  else if (f.minutes > 0) parts.push({ text: ` ${left}`, color: C.accent })
  else parts.push({ text: ` ${compact(elapsed)}`, dim: true })
  return { id: 'focus', rank: 7, parts, card: [{ text: L.card.focus(f.minutes > 0 ? left : compact(elapsed)) }] }
}

export function liveSeg(l: TabLive | null, now: number): Seg | null {
  if (l === null) return null
  const pulse = ['●', '◉', '○', '◉'][Math.floor(now / 1000) % 4]!
  const parts: Part[] = [
    { text: `${pulse} `, color: C.accent },
    { text: compact(now - l.startedAt), bold: true },
  ]
  if (l.tools > 0) parts.push({ text: ` · ${l.tools} ${L.band.tools}`, dim: true })
  if (l.lastTool !== '') parts.push({ text: ` · ${truncate(l.lastTool, 14)}`, dim: true })
  if (l.errors > 0) parts.push({ text: ` · ${l.errors} ${L.band.errors}`, color: C.red })
  return { id: 'live', rank: 10, parts }
}

export function lastTurnSeg(last: TabTurn | undefined, count: number, on: Handlers): Seg | null {
  if (last === undefined) return null
  const parts: Part[] = [
    { text: `◷ ${L.band.turn} ${count} · ${compact(last.ms)}`, dim: true, press: () => on.open('overview'), hoverColor: C.accent },
  ]
  if (last.tools > 0) parts.push({ text: ` · ${last.tools} ${L.band.tools}`, dim: true })
  if (last.errors > 0) parts.push({ text: ` · ${last.errors} ${L.band.errors}`, color: C.red, dim: true })
  return { id: 'turn', rank: 3, parts }
}
