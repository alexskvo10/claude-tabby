// The band above the prompt: two calm rows, or one in compact mode.
//   row 1, the session: cat, context, rate limits, cost
//   row 2, the work: live turn or last turn, git, tests, focus, todo
import type { RenderElement } from 'claude-code'

import { C } from '../lib/format'
import { fit } from '../lib/layout'
import type { Seg } from '../lib/layout'
import { face, mood } from '../lib/pet'
import type { Snapshot } from '../snapshot'
import type { El } from './parts'
import {
  compactHintSeg,
  costSeg,
  ctxSeg,
  ctxTokensSeg,
  focusSeg,
  gitSeg,
  joinSegs,
  lastTurnSeg,
  limitSegs,
  Line,
  liveSeg,
  testsSeg,
  todoSegs,
} from './parts'

const OPEN = '≡'

function present(list: readonly (Seg | null)[]): Seg[] {
  return list.filter((s): s is Seg => s !== null)
}

export type BandProps = { bodyColumns: number; isWorking: boolean }

export function drawBand(el: El, snap: Snapshot, props: BandProps, onOpen: () => void): RenderElement {
  const { usage, git, turns, live, todos, tests, focus, pet, prefs, now } = snap
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
    ? { id: 'cat', rank: 5, parts: [{ text: face(catMood, now), color: C.accent }] }
    : null

  // a turn already running when the mod (re)loaded has no clock of ours
  const working: Seg | null =
    liveSeg(live, now) ??
    (props.isWorking ? { id: 'live', rank: 10, parts: [{ text: '● ', color: C.accent }, { text: 'работает', bold: true }] } : null)

  const { Box, Button } = el
  const open = <Button key="open" label={OPEN} plain dimColor onPress={() => onOpen()} />

  if (prefs.isCompact) {
    const row = fit(
      present([
        cat,
        ctxSeg(usage, 5),
        compactHintSeg(usage),
        ...limitSegs(usage, now, 0).filter(s => s.id.startsWith('limit:')),
        working,
        gitSeg(git),
        testsSeg(tests, now),
        focusSeg(focus, now, 18),
        ...todoSegs(todos, 0).slice(0, 1),
      ]),
      width,
    )
    return (
      <Box flexDirection="row" justifyContent="space-between" width={props.bodyColumns}>
        {Line(el, joinSegs(row), 'row')}
        {open}
      </Box>
    )
  }

  const session = fit(
    present([
      cat,
      ctxSeg(usage, barWidth),
      ctxTokensSeg(usage),
      compactHintSeg(usage),
      ...limitSegs(usage, now, limitBar),
      costSeg(usage),
    ]),
    width,
  )

  const work = fit(
    present([
      working ?? lastTurnSeg(last, turns.count),
      gitSeg(git),
      testsSeg(tests, now),
      focusSeg(focus, now, isWide ? 32 : 20),
      ...todoSegs(todos, isWide ? 32 : 18),
    ]),
    props.bodyColumns,
  )

  return (
    <Box flexDirection="column" width={props.bodyColumns}>
      <Box flexDirection="row" justifyContent="space-between">
        {Line(el, joinSegs(session), 'session')}
        {open}
      </Box>
      {work.length > 0 ? Line(el, joinSegs(work), 'work') : null}
    </Box>
  )
}
