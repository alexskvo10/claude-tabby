// The band above the prompt: two calm rows, or one in compact mode.
//   row 1, the session: cat, context, rate limits, cost
//   row 2, the work: live or last turn, git, tests, Claude's plan, focus, todo
// Every block is a hover target: its card (the details) covers the other row
// while the pointer rests on it. Its label is a button that opens its tab.
import type { RenderElement } from 'claude-code'

import { C, pad, truncate } from '../lib/format'
import { L } from '../lib/i18n'
import { fit, partsWidth, SEPARATOR } from '../lib/layout'
import type { Part, Seg } from '../lib/layout'
import { face, mood } from '../lib/pet'
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

export type BandProps = { bodyColumns: number; isWorking: boolean }

function present(list: readonly (Seg | null)[]): Seg[] {
  return list.filter((s): s is Seg => s !== null)
}

/**
 * One row of segments. With `cardTop`, each segment that has a card shows it
 * that many rows away (1 below, -1 above) while hovered, over the whole width.
 */
function Row(el: El, segs: readonly Seg[], key: string, width: number, cardTop?: number): RenderElement {
  const { Box, Text } = el
  let offset = 0
  const children: RenderElement[] = []
  segs.forEach((s, i) => {
    if (i > 0) {
      children.push(<Text>{SEPARATOR}</Text>)
      offset += SEPARATOR.length
    }
    const left = offset
    offset += partsWidth(s.parts)
    const card =
      cardTop !== undefined && s.card !== undefined ? (
        <Box
          position="absolute"
          top={cardTop}
          left={-left}
          width={width}
          display="none"
          hover={{ display: 'flex' }}
          flexDirection="row"
        >
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
  return (
    <Box key={key} flexDirection="row">
      {children}
    </Box>
  )
}

/** A card's line, led by a mark and padded so it covers the row beneath. */
function cardParts(card: readonly Part[], width: number): Part[] {
  const lead: Part = { text: '› ', color: C.accent }
  const used = partsWidth([lead, ...card])
  const parts = [lead, ...card]
  if (used > width) {
    // cut the last runs to fit
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
  return [...parts, { text: ' '.repeat(width - used) }]
}

export function drawBand(el: El, snap: Snapshot, props: BandProps, on: Handlers): RenderElement {
  const { usage, samples, git, turns, live, todos, plan, tests, focus, pet, prefs, now } = snap
  const width = Math.max(10, props.bodyColumns - 2)
  const isWide = width >= 110
  const barWidth = isWide ? 10 : width >= 80 ? 8 : 5
  const limitBar = isWide ? 6 : width >= 90 ? 4 : 0

  const last = turns.history.at(-1)
  const catMood = mood({
    isWorking: live !== null || props.isWorking,
    isTestsRed: tests.status === 'fail',
    isFocused: focus !== null,
    idleMs: last === undefined ? 0 : now - last.at,
    sinceUnlockMs: pet.lastUnlock === null ? Infinity : now - pet.lastUnlockAt,
  })
  const cat: Seg | null = prefs.isPetShown
    ? { id: 'cat', rank: 5, parts: [{ text: face(catMood, now), color: C.accent }], card: [{ text: L.tabs.pet, bold: true }, { text: ` · ${L.pet.moods[catMood]}`, dim: true }] }
    : null

  // a turn already running when the mod (re)loaded has no clock of ours
  const working: Seg | null =
    liveSeg(live, now) ??
    (props.isWorking ? { id: 'live', rank: 10, parts: [{ text: '● ', color: C.accent }, { text: L.band.working, bold: true }] } : null)

  const { Box, Button, Text } = el
  const open = (
    <Button key="open" label={OPEN} plain dimColor hover={{ scope: 'open', color: C.accent, dimColor: false }} onPress={() => on.open()} />
  )

  if (prefs.isCompact) {
    const row = fit(
      present([
        cat,
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
    )
    return (
      <Box flexDirection="row" justifyContent="space-between" width={props.bodyColumns}>
        {Row(el, row, 'row', props.bodyColumns)}
        {open}
      </Box>
    )
  }

  const session = fit(
    present([
      cat,
      ctxSeg(usage, turns.history, barWidth, on),
      ctxLeftSeg(usage, turns.history),
      ctxTokensSeg(usage),
      compactHintSeg(usage),
      ...limitSegs(usage, samples, now, limitBar, on),
      snap.showCost ? costSeg(usage, turns.history, on) : null,
    ]),
    width,
  )

  const work = fit(
    present([
      working ?? lastTurnSeg(last, turns.count, on),
      gitSeg(git, on),
      testsSeg(tests, now, on),
      planSeg(plan, isWide ? 28 : 14, on),
      focusSeg(focus, now, isWide ? 28 : 18, on),
      ...todoSegs(todos, isWide ? 28 : 16, on),
    ]),
    props.bodyColumns,
  )

  const intro = prefs.introSeen <= 3 ? <Text dimColor wrap="truncate-end">{truncate(L.band.intro, props.bodyColumns)}</Text> : null

  // cards need the other row to lie over; without one there is nowhere to show them
  return (
    <Box flexDirection="column" width={props.bodyColumns}>
      <Box flexDirection="row" justifyContent="space-between">
        {Row(el, session, 'session', props.bodyColumns, work.length > 0 ? 1 : undefined)}
        {open}
      </Box>
      {work.length > 0 ? Row(el, work, 'work', props.bodyColumns, -1) : null}
      {intro}
    </Box>
  )
}
