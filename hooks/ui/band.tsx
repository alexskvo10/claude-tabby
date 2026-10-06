// The band above the prompt: two calm rows, or one in compact mode.
//   left    Tabby in pixel art, animated: cells on the terminal, SVG elsewhere
//   row 1   the session: context, rate limits, cost
//   row 2   the work: live or last turn, git, tests
//   row 3   the tasks: Claude's plan, focus, todo (beside the pixel cat; else on row 2)
// Blocks sit in groups with room between them, lined up in columns across
// the rows wherever the width allows. Every block is a hover
// target whose card covers the other row; its label is a button to its tab.
import type { RenderElement } from 'claude-code'

import { frameAt } from '../lib/anim'
import { C, pad, truncate } from '../lib/format'
import { L } from '../lib/i18n'
import { columns, fit, groupedWidth, groups, GROUP_GAP, partsWidth } from '../lib/layout'
import type { Part, Seg } from '../lib/layout'
import { face, mood } from '../lib/pet'
import type { Mood } from '../lib/pet'
import { toCells } from '../lib/pixels'
import { smallCat } from '../lib/sprites'
import type { Handlers, Snapshot } from '../snapshot'
import type { El } from './parts'
import {
  CatSvg,
  compactHintSeg,
  costSeg,
  ctxLeftSeg,
  ctxSeg,
  ctxTokensSeg,
  focusSeg,
  gitSeg,
  lastTurnSeg,
  limitSegs,
  liveSeg,
  planSeg,
  Runs,
  testsSeg,
  todoSegs,
} from './parts'

const OPEN = '≡'
const CAT_COLUMNS = 11

export type BandProps = { bodyColumns: number; isWorking: boolean }

function present(list: readonly (Seg | null)[]): Seg[] {
  return list.filter((s): s is Seg => s !== null)
}

/** A card's line, led by a mark and padded so it covers the row beneath. */
function cardParts(card: readonly Part[], width: number): Part[] {
  const lead: Part = { text: '› ', color: C.accent }
  const parts = [lead, ...card]
  const used = partsWidth(parts)
  if (used <= width) return [...parts, { text: ' '.repeat(width - used) }]
  const out: Part[] = []
  let room = width
  for (const p of parts) {
    if (room <= 0) break
    const t = pad(p.text, Math.min(room, Array.from(p.text).length))
    out.push({ ...p, text: t })
    room -= Array.from(t).length
  }
  return out
}

/**
 * A card as one run of text, so it is cut, if at all, only at its end. The
 * terminal pads it to its width, covering the row beneath; elsewhere the
 * surface draws the card on its own ground, and the text wraps rather than
 * lose its end.
 */
function Card(el: El, card: readonly Part[], width: number): RenderElement {
  const { Text } = el
  const isTerminal = 'Raster' in el
  const parts = isTerminal ? cardParts(card, width) : [{ text: '› ', color: C.accent }, ...card]
  return (
    <Text wrap={isTerminal ? 'truncate-end' : 'wrap'}>
      {parts.map(p => (
        <Text color={p.color} dimColor={p.dim} bold={p.bold}>
          {p.text}
        </Text>
      ))}
    </Text>
  )
}

/**
 * One row of segments in groups: a cell of gap inside a group, more between
 * groups. With `cols`, each group but the last is a box that wide, so the rows'
 * groups line up in columns (on the terminal: a box's width counts monospace
 * cells, and the other surfaces draw the band in a proportional font, where
 * text outgrows such a box). With `cardTop`, each segment that has a card
 * shows it that many rows away (1 below, -1 above) while hovered.
 */
function Row(el: El, segs: readonly Seg[], key: string, width: number, cardTop?: number, cols?: readonly number[] | null): RenderElement {
  const { Box } = el
  let offset = 0
  const children: RenderElement[] = []
  const gs = groups(segs)
  gs.forEach((g, gi) => {
    const start = offset
    const inner: RenderElement[] = []
    g.forEach((s, si) => {
      if (si > 0) offset += 1
      const left = offset
      offset += partsWidth(s.parts)
      // as wide as its text, not the row, under its block (shifted left where
      // the row runs out): the pointer on a card counts as on its block, so a
      // full-width card stayed up wherever the pointer crossed
      const cardWidth = s.card === undefined ? 0 : Math.min(width, partsWidth(s.card) + 2)
      const card =
        cardTop !== undefined && s.card !== undefined ? (
          <Box position="absolute" top={cardTop} left={Math.min(0, width - cardWidth - left)} width={cardWidth} display="none" hover={{ display: 'flex' }} flexDirection="row">
            {Card(el, s.card, cardWidth)}
          </Box>
        ) : null
      inner.push(
        <Box key={`${key}-${s.id}`} flexDirection="row">
          {Runs(el, s.parts, `${key}-${s.id}`)}
          {card}
        </Box>,
      )
    })
    const col = cols?.[gi]
    if (col !== undefined) offset = start + col
    children.push(
      <Box key={`${key}-g${gi}`} flexDirection="row" columnGap={1} {...(col !== undefined ? { width: col } : {})}>
        {inner}
      </Box>,
    )
    offset += GROUP_GAP.length
  })
  return (
    <Box key={key} flexDirection="row" columnGap={GROUP_GAP.length}>
      {children}
    </Box>
  )
}

export type BandDrawn = { tree: RenderElement; mood: Mood; hasCat: boolean }

export function drawBand(el: El, snap: Snapshot, props: BandProps, on: Handlers): BandDrawn {
  const { usage, samples, git, turns, live, todos, plan, tests, focus, pet, prefs, now } = snap
  const measure = groupedWidth
  const Raster = 'Raster' in el ? el.Raster : undefined
  const hasSvg = 'Svg' in el
  // the pixel cat: cells on the terminal, SVG on the other surfaces
  const showCat = prefs.isPetShown && !prefs.isCompact && (Raster !== undefined || hasSvg)
  // only the cells are repainted by the animator; the SVG plays itself
  const hasCat = showCat && Raster !== undefined
  const rowsWidth = Math.max(10, props.bodyColumns - (showCat ? CAT_COLUMNS + 1 : 0))
  const width = rowsWidth - 2
  const isWide = width >= 100
  // one size at any usual width; a band too narrow for the context block
  // shortens its bar, and one too narrow for three bars draws the limits
  // without theirs (the session row below may shorten all three together)
  const barWidth = Math.max(3, Math.min(10, width - 9))
  // the limits' bars match the context's, so all three read on one scale
  const limitBar = width >= 70 ? barWidth : 0

  const last = turns.history.at(-1)
  const catMood = mood({
    isWorking: live !== null || props.isWorking,
    isTestsRed: tests.status === 'fail',
    isFocused: focus !== null,
    idleMs: last === undefined ? 0 : now - last.at,
    sinceUnlockMs: pet.lastUnlock === null ? Infinity : now - pet.lastUnlockAt,
  })
  const textCat: Seg | null =
    prefs.isPetShown && !showCat
      ? {
          id: 'cat',
          group: 'cat',
          rank: 5,
          parts: [{ text: face(catMood, now), color: C.accent }],
          card: [{ text: L.tabs.pet, bold: true }, { text: ` · ${L.pet.moods[catMood]}`, dim: true }],
        }
      : null

  // a turn already running when the mod (re)loaded has no clock of ours
  const working: Seg | null =
    liveSeg(live, now) ??
    (props.isWorking ? { id: 'live', group: 'turn', rank: 10, parts: [{ text: '● ', color: C.accent }, { text: L.band.working, bold: true }] } : null)

  const { Box, Button, Text } = el
  const open = (
    <Button key="open" label={OPEN} plain dimColor hover={{ scope: 'open', color: C.accent, dimColor: false }} onPress={() => on.open()} />
  )

  if (prefs.isCompact) {
    const row = fit(
      present([
        textCat,
        ctxSeg(usage, turns.history, barWidth, on),
        compactHintSeg(usage),
        ...limitSegs(usage, samples, now, 0, on).filter(s => !s.id.startsWith('reset:')),
        working,
        gitSeg(git, on),
        testsSeg(tests, now, on),
        planSeg(plan, 0, on),
        focusSeg(focus, now, 18, on),
        ...todoSegs(todos, 0, on),
      ]),
      width,
      measure,
    )
    const tree = (
      <Box flexDirection="row" justifyContent="space-between" width={props.bodyColumns}>
        {Row(el, row, 'row', props.bodyColumns)}
        {open}
      </Box>
    )
    return { tree, mood: catMood, hasCat: false }
  }

  // the resets matter more than long bars: all three bars shorten together
  // (10, 8, 6) before a reset time leaves the row
  const sessionAt = (bar: number, limit: number) =>
    fit(
      present([
        textCat,
        ctxSeg(usage, turns.history, bar, on),
        ctxLeftSeg(usage, turns.history),
        ctxTokensSeg(usage),
        compactHintSeg(usage),
        ...limitSegs(usage, samples, now, limit, on),
        snap.showCost ? costSeg(usage, turns.history, on) : null,
      ]),
      width,
      measure,
    )
  const resets = (usage?.limits ?? []).filter(l => l.resetsAt !== undefined).length
  const hasResets = (row: readonly Seg[]) => row.filter(s => s.id.startsWith('reset:')).length >= resets
  const session =
    [10, 8, 6].filter(b => b <= barWidth).map(b => sessionAt(b, limitBar === 0 ? 0 : b)).find(hasResets) ??
    sessionAt(barWidth, limitBar)

  const turnSegs = present([working ?? lastTurnSeg(last, turns.count, on), gitSeg(git, on), testsSeg(tests, now, on)])
  const taskSegs = present([
    planSeg(plan, isWide ? 28 : 14, on),
    focusSeg(focus, now, isWide ? 28 : 18, on),
    ...todoSegs(todos, isWide ? 28 : 16, on),
  ])
  // the pixel cat stands three rows tall: the work splits into the turn and
  // the tasks; without it the work keeps to one row
  const work = fit(showCat ? turnSegs : [...turnSegs, ...taskSegs], rowsWidth, measure)
  const tasks = showCat ? fit(taskSegs, rowsWidth, measure) : []
  // columns only where a cell is a character: see Row
  const [sessionCols, workCols, tasksCols] = Raster !== undefined ? columns([session, work, tasks], [width, rowsWidth, rowsWidth]) : []

  const isIntro = prefs.introSeen <= 3
  const introLine = (w: number) => (
    <Text dimColor wrap="truncate-end">
      {truncate(L.band.intro, w)}
    </Text>
  )

  const picture = !showCat
    ? null
    : Raster !== undefined
      ? <Raster key="cat" {...toCells(smallCat(catMood, frameAt(catMood, now, 'small')))} />
      : CatSvg(el, 'cat', catMood, 'small', now, snap.animate)
  const cat = picture === null ? null : <Box marginRight={1}>{picture}</Box>

  const rows: RenderElement[] = [
    <Box flexDirection="row" justifyContent="space-between">
      {Row(el, session, 'session', rowsWidth, work.length > 0 || showCat ? 1 : undefined, sessionCols)}
      {open}
    </Box>,
    work.length > 0 ? Row(el, work, 'work', rowsWidth, -1, workCols) : <Text> </Text>,
  ]
  if (showCat) {
    // the third row: the tasks, else the first sessions' hint, else room for the cat
    rows.push(tasks.length > 0 ? Row(el, tasks, 'tasks', rowsWidth, -1, tasksCols) : isIntro ? introLine(rowsWidth) : <Text> </Text>)
  }
  const isIntroBelow = isIntro && (!showCat || tasks.length > 0)

  const tree = (
    <Box flexDirection="column" width={props.bodyColumns}>
      <Box flexDirection="row">
        {cat}
        {/* the other surfaces' bars fill their whole line: a row of room between rows */}
        <Box flexDirection="column" width={rowsWidth} rowGap={Raster === undefined ? 1 : 0}>
          {rows}
        </Box>
      </Box>
      {isIntroBelow ? introLine(props.bodyColumns) : null}
    </Box>
  )
  return { tree, mood: catMood, hasCat }
}
