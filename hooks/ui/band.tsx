// The band above the prompt: two calm rows, or one in compact mode.
//   left    Tabby in pixel art, animated (terminal), or as a face in text
//   row 1   the session: context, rate limits, cost
//   row 2   the work: live or last turn, git, tests
//   row 3   the tasks: Claude's plan, focus, todo (beside the pixel cat; else on row 2)
// Blocks sit in groups with thin rules between them. Every block is a hover
// target whose card covers the other row; its label is a button to its tab.
import type { RenderElement } from 'claude-code'

import { frameAt } from '../lib/anim'
import { C, pad, truncate } from '../lib/format'
import { L } from '../lib/i18n'
import { fit, groupedWidth, groups, GROUP_GAP, partsWidth } from '../lib/layout'
import type { Part, Seg } from '../lib/layout'
import { face, mood } from '../lib/pet'
import type { Mood } from '../lib/pet'
import { toCells } from '../lib/pixels'
import { smallCat } from '../lib/sprites'
import type { Handlers, Snapshot } from '../snapshot'
import type { El } from './parts'
import {
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
 * One row of segments in groups: a space inside a group, a thin rule between
 * groups. With `cardTop`, each segment that has a card shows it that many rows
 * away (1 below, -1 above) while hovered.
 */
function Row(el: El, segs: readonly Seg[], key: string, width: number, cardTop?: number): RenderElement {
  const { Box, Text } = el
  let offset = 0
  const children: RenderElement[] = []
  const text = (t: string, dim = false) => {
    children.push(<Text dimColor={dim}>{t}</Text>)
    offset += Array.from(t).length
  }
  groups(segs).forEach((g, gi) => {
    if (gi > 0) text(GROUP_GAP, true)
    g.forEach((s, si) => {
      if (si > 0) text(' ')
      const left = offset
      offset += partsWidth(s.parts)
      const card =
        cardTop !== undefined && s.card !== undefined ? (
          <Box position="absolute" top={cardTop} left={-left} width={width} display="none" hover={{ display: 'flex' }} flexDirection="row">
            {Runs(el, cardParts(s.card, width), `${key}-${s.id}-card`)}
          </Box>
        ) : null
      children.push(
        <Box key={`${key}-${s.id}`} flexDirection="row">
          {Runs(el, s.parts, `${key}-${s.id}`)}
          {card}
        </Box>,
      )
    })
  })
  return (
    <Box key={key} flexDirection="row">
      {children}
    </Box>
  )
}

export type BandDrawn = { tree: RenderElement; mood: Mood; hasCat: boolean }

export function drawBand(el: El, snap: Snapshot, props: BandProps, on: Handlers): BandDrawn {
  const { usage, samples, git, turns, live, todos, plan, tests, focus, pet, prefs, now } = snap
  const measure = groupedWidth
  const Raster = 'Raster' in el ? el.Raster : undefined
  const hasCat = prefs.isPetShown && !prefs.isCompact && Raster !== undefined
  const rowsWidth = Math.max(10, props.bodyColumns - (hasCat ? CAT_COLUMNS + 1 : 0))
  const width = rowsWidth - 2
  const isWide = width >= 100
  const barWidth = isWide ? 10 : width >= 76 ? 8 : 5
  const limitBar = isWide ? 6 : width >= 86 ? 4 : 0

  const last = turns.history.at(-1)
  const catMood = mood({
    isWorking: live !== null || props.isWorking,
    isTestsRed: tests.status === 'fail',
    isFocused: focus !== null,
    idleMs: last === undefined ? 0 : now - last.at,
    sinceUnlockMs: pet.lastUnlock === null ? Infinity : now - pet.lastUnlockAt,
  })
  const textCat: Seg | null =
    prefs.isPetShown && !hasCat
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
        ctxSeg(usage, turns.history, 5, on),
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

  const session = fit(
    present([
      textCat,
      ctxSeg(usage, turns.history, barWidth, on),
      ctxLeftSeg(usage, turns.history),
      ctxTokensSeg(usage),
      compactHintSeg(usage),
      ...limitSegs(usage, samples, now, limitBar, on),
      snap.showCost ? costSeg(usage, turns.history, on) : null,
    ]),
    width,
    measure,
  )

  const turnSegs = present([working ?? lastTurnSeg(last, turns.count, on), gitSeg(git, on), testsSeg(tests, now, on)])
  const taskSegs = present([
    planSeg(plan, isWide ? 28 : 14, on),
    focusSeg(focus, now, isWide ? 28 : 18, on),
    ...todoSegs(todos, isWide ? 28 : 16, on),
  ])
  // the pixel cat stands three rows tall: the work splits into the turn and
  // the tasks; without it the work keeps to one row
  const work = fit(hasCat ? turnSegs : [...turnSegs, ...taskSegs], rowsWidth, measure)
  const tasks = hasCat ? fit(taskSegs, rowsWidth, measure) : []

  const isIntro = prefs.introSeen <= 3
  const introLine = (w: number) => (
    <Text dimColor wrap="truncate-end">
      {truncate(L.band.intro, w)}
    </Text>
  )

  const cat =
    hasCat && Raster !== undefined ? (
      <Box marginRight={1}>
        <Raster key="cat" {...toCells(smallCat(catMood, frameAt(catMood, now, 'small')))} />
      </Box>
    ) : null

  const rows: RenderElement[] = [
    <Box flexDirection="row" justifyContent="space-between">
      {Row(el, session, 'session', rowsWidth, work.length > 0 || hasCat ? 1 : undefined)}
      {open}
    </Box>,
    work.length > 0 ? Row(el, work, 'work', rowsWidth, -1) : <Text> </Text>,
  ]
  if (hasCat) {
    // the third row: the tasks, else the first sessions' hint, else room for the cat
    rows.push(tasks.length > 0 ? Row(el, tasks, 'tasks', rowsWidth, -1) : isIntro ? introLine(rowsWidth) : <Text> </Text>)
  }
  const isIntroBelow = isIntro && (!hasCat || tasks.length > 0)

  const tree = (
    <Box flexDirection="column" width={props.bodyColumns}>
      <Box flexDirection="row">
        {cat}
        <Box flexDirection="column" width={rowsWidth}>
          {rows}
        </Box>
      </Box>
      {isIntroBelow ? introLine(props.bodyColumns) : null}
    </Box>
  )
  return { tree, mood: catMood, hasCat }
}
