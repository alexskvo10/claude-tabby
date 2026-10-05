// The dashboard pane: five tabs (keys 1-5 while it holds the keyboard), each
// with a one-line hint of its keys at the foot.
import type { RenderElement } from 'claude-code'

import type { TabId } from '../../types'
import { CAT_PNG } from '../lib/cat-png'
import {
  ago,
  C,
  clock,
  compact,
  duration,
  heat,
  limitLabel,
  money,
  percent,
  sparkline,
  tokens,
  truncate,
  until,
} from '../lib/format'
import { burn, contextGrowth, turnsLeft } from '../lib/forecast'
import { fileTone } from '../lib/git'
import { L } from '../lib/i18n'
import type { Part } from '../lib/layout'
import { achievements, art, level, mood, XP } from '../lib/pet'
import { dayKey, lastDays, streak } from '../lib/stats'
import type { Handlers, Snapshot } from '../snapshot'
import { barParts, Line } from './parts'
import type { El } from './parts'

const TABS: readonly { id: TabId; key: string }[] = [
  { id: 'overview', key: '1' },
  { id: 'git', key: '2' },
  { id: 'tasks', key: '3' },
  { id: 'tests', key: '4' },
  { id: 'pet', key: '5' },
]

function tone(code: string): Part {
  const t = fileTone(code)
  if (t === 'dim') return { text: '', dim: true }
  return { text: '', color: { green: C.green, yellow: C.yellow, red: C.red, blue: C.blue }[t] }
}

function title(el: El, text: string, extra?: string): RenderElement {
  const { Text, Box } = el
  return (
    <Box marginTop={1} flexDirection="row">
      <Text bold color={C.accent}>
        {text.toUpperCase()}
      </Text>
      {extra !== undefined ? <Text dimColor>{`  ${extra}`}</Text> : null}
    </Box>
  )
}

/** A tab's label with what needs attention there, so it is seen from any tab. */
function badge(id: TabId, snap: Snapshot): string {
  if (id === 'git' && snap.git !== null) {
    if (snap.git.conflicts > 0) return ` ✗${snap.git.conflicts}`
    const dirty = snap.git.staged + snap.git.changed + snap.git.untracked
    return dirty > 0 ? ` ✚${dirty}` : ''
  }
  if (id === 'tasks') {
    const open = snap.todos.filter(t => !t.done).length
    return snap.focus !== null ? ' ◎' : open > 0 ? ` ${open}` : ''
  }
  if (id === 'tests') return snap.tests.status === 'fail' ? ' ✗' : snap.tests.status === 'running' ? ' ◐' : ''
  if (id === 'overview' && (snap.usage?.percent ?? 0) >= 85) return ' ⚠'
  return ''
}

export function drawPane(el: El, snap: Snapshot, bodyColumns: number, hasInput: boolean, on: Handlers): RenderElement {
  const { Box, Button, Text } = el
  const tab = snap.prefs.tab
  const width = Math.max(24, bodyColumns)

  const header = (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
      {TABS.map(t => (
        <Button
          key={`tab-${t.id}`}
          label={`${L.tabs[t.id]}${badge(t.id, snap)}`}
          hotkey={t.key}
          plain
          dimColor={tab !== t.id}
          onPress={() => on.setTab(t.id)}
        />
      ))}
    </Box>
  )

  let body: RenderElement
  if (tab === 'git') body = gitTab(el, snap, width, hasInput, on)
  else if (tab === 'tasks') body = tasksTab(el, snap, width, hasInput, on)
  else if (tab === 'tests') body = testsTab(el, snap, width, on)
  else if (tab === 'pet') body = petTab(el, snap, width, on)
  else body = overviewTab(el, snap, width)

  return (
    <Box flexDirection="column" width={width}>
      {header}
      <Text dimColor>{'─'.repeat(width)}</Text>
      {body}
      <Box marginTop={1}>
        <Text dimColor wrap="wrap">
          {L.hint[tab]}
        </Text>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------- overview

function overviewTab(el: El, snap: Snapshot, width: number): RenderElement {
  const { Box, Text } = el
  const { usage, turns, live, samples, stats, tests, git, now } = snap
  const barWidth = Math.max(8, Math.min(30, width - 24))
  const rows: RenderElement[] = []

  // what needs attention, or a calm word
  const warns: string[] = []
  if ((usage?.percent ?? 0) >= 85) warns.push(L.overview.warnContext)
  for (const l of usage?.limits ?? []) {
    if (burn(samples, l.kind, now, until(l.resetsAt, now))?.runsOutInMs !== undefined) warns.push(L.overview.warnLimit(limitLabel(l.kind)))
  }
  if (tests.status === 'fail') warns.push(L.overview.warnTests)
  if ((git?.conflicts ?? 0) > 0) warns.push(L.overview.warnConflicts)
  rows.push(
    <Box marginTop={1} flexDirection="row">
      {warns.length === 0
        ? Line(el, [{ text: '✓ ', color: C.green }, { text: L.overview.allCalm, dim: true }])
        : Line(el, [{ text: '⚠ ', color: C.red }, { text: warns.join(' · '), color: C.red }])}
    </Box>,
  )

  rows.push(title(el, L.overview.context))
  if (usage === null || usage.percent === undefined) {
    rows.push(<Text dimColor>{L.overview.freshWindow(usage !== null ? tokens(usage.window) : '—')}</Text>)
  } else {
    const pct = usage.percent
    const growth = contextGrowth(turns.history)
    const left = turnsLeft(usage.tokens, usage.window, growth)
    rows.push(Line(el, [...barParts(pct, barWidth), { text: `  ${percent(pct)}`, color: heat(pct), bold: true }]))
    rows.push(
      Line(el, [
        { text: L.overview.tokensOf(tokens(usage.tokens ?? 0), tokens(usage.window)), dim: true },
        ...(growth !== undefined && left !== undefined ? [{ text: L.overview.perTurn(tokens(growth), left), color: left <= 5 ? C.red : undefined, dim: left > 5 }] : []),
        ...(pct >= 85 ? [{ text: L.overview.compactSoon, color: C.red }] : []),
      ]),
    )
  }

  rows.push(title(el, L.overview.limits))
  if (usage === null || usage.limits.length === 0) {
    rows.push(<Text dimColor>{L.overview.noLimits}</Text>)
  } else {
    for (const l of usage.limits) {
      const left = until(l.resetsAt, now)
      const b = burn(samples, l.kind, now, left)
      rows.push(
        Line(el, [
          { text: limitLabel(l.kind).padEnd(3), bold: true },
          ...barParts(l.percent, Math.max(6, barWidth - 4)),
          { text: `  ${percent(l.percent)}`, color: heat(l.percent), bold: l.percent >= 85 },
          ...(left !== undefined ? [{ text: `  ${L.overview.resetIn(duration(left))}`, dim: true }] : []),
        ]),
      )
      if (b?.runsOutInMs !== undefined) {
        rows.push(Line(el, [{ text: `   ${L.overview.runsOut(duration(b.runsOutInMs))}`, color: C.red }]))
      }
    }
  }

  rows.push(title(el, L.overview.session))
  const costs = turns.history.map(t => t.costUsd).filter((c): c is number => c !== undefined)
  const facts: string[] = []
  if (usage !== null) facts.push(duration(now - usage.startedAt))
  facts.push(L.turns(turns.count))
  facts.push(L.overview.tools(turns.tools))
  if (snap.showCost && usage?.costUsd !== undefined && usage.costUsd >= 0.005) facts.push(money(usage.costUsd))
  const avgCost = costs.length > 0 ? costs.reduce((s, c) => s + c, 0) / costs.length : 0
  if (snap.showCost && avgCost >= 0.005) facts.push(L.overview.perTurnCost(money(avgCost)))
  rows.push(<Text>{facts.join(' · ')}</Text>)
  if (live !== null) {
    rows.push(
      Line(el, [
        { text: '● ', color: C.accent },
        { text: L.overview.liveTurn(duration(now - live.startedAt)), bold: true },
        { text: ` · ${live.tools} ${L.band.tools}${live.lastTool !== '' ? ` · ${live.lastTool}` : ''}`, dim: true },
      ]),
    )
  }

  const today = stats.days[dayKey(now)]
  const days = lastDays(stats, now, 14)
  const run = streak(stats, now)
  rows.push(title(el, L.overview.today, run > 1 ? L.overview.streak(run) : undefined))
  rows.push(
    <Text>
      {L.overview.todayLine(
        today?.turns ?? 0,
        (today?.focusMs ?? 0) >= 60_000 ? compact(today?.focusMs ?? 0) : '',
        snap.showCost && (today?.costUsd ?? 0) >= 0.005 ? money(today?.costUsd ?? 0) : '',
      )}
    </Text>,
  )
  if (days.some(d => d.day.turns > 0)) {
    rows.push(
      Line(el, [
        { text: sparkline(days.map(d => d.day.turns)), color: C.accent },
        { text: `  ${L.overview.twoWeeks}`, dim: true },
      ]),
    )
  }

  const history = turns.history.slice(-Math.max(5, Math.min(30, width - 4)))
  if (history.length > 0) {
    rows.push(title(el, L.overview.turns, L.overview.lastN(history.length)))
    rows.push(<Text color={C.accent}>{sparkline(history.map(t => t.ms))}</Text>)
    const total = history.reduce((s, t) => s + t.ms, 0)
    const max = history.reduce((m, t) => Math.max(m, t.ms), 0)
    const toolsAvg = history.reduce((s, t) => s + t.tools, 0) / history.length
    const last = history.at(-1)!
    rows.push(<Text dimColor>{L.overview.avg(compact(total / history.length), compact(max), toolsAvg.toFixed(1))}</Text>)
    rows.push(
      <Text dimColor>
        {`${L.overview.last}: ${duration(last.ms)} · ${last.tools} ${L.band.tools}${last.errors > 0 ? ` · ${last.errors} ${L.band.errors}` : ''}${last.tokens > 0 ? ` · ${tokens(last.tokens)} ${L.band.tok}` : ''}${snap.showCost && last.costUsd !== undefined && last.costUsd >= 0.005 ? ` · ${money(last.costUsd)}` : ''}`}
      </Text>,
    )
  }

  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- git

function gitTab(el: El, snap: Snapshot, width: number, hasInput: boolean, on: Handlers): RenderElement {
  const { Box, Button, Text, Link } = el
  const { git, now } = snap
  const Input = 'Input' in el ? el.Input : undefined
  const refresh = <Button key="git-refresh" label={L.git.refresh} hotkey="r" onPress={() => on.refreshGit()} />

  if (git === null) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{L.git.noRepo}</Text>
        <Box marginTop={1}>{refresh}</Box>
      </Box>
    )
  }

  const rows: RenderElement[] = []
  const head: Part[] = [
    { text: '⎇ ', color: C.purple },
    { text: git.branch, color: C.purple, bold: true },
  ]
  if (git.upstream !== null) head.push({ text: `  → ${git.upstream}`, dim: true })
  if (git.ahead > 0) head.push({ text: `  ↑${git.ahead}`, color: C.green })
  if (git.behind > 0) head.push({ text: `  ↓${git.behind}`, color: C.red })
  rows.push(<Box marginTop={1}>{Line(el, head)}</Box>)
  rows.push(<Text dimColor>{`${git.repo ?? L.git.local} · ${L.git.updated(ago(git.at, now))}`}</Text>)

  if (git.pr !== null) {
    const pr = git.pr
    const { passed, failed, pending } = pr.checks
    rows.push(title(el, L.git.pr))
    rows.push(
      Line(el, [
        { text: `#${pr.number} `, color: C.blue, bold: true },
        { text: truncate(pr.title, width - 12) },
        ...(pr.isDraft ? [{ text: ` · ${L.git.draft}`, dim: true }] : []),
      ]),
    )
    if (passed + failed + pending > 0) {
      rows.push(
        Line(el, [
          { text: failed > 0 ? '✗ ' : pending > 0 ? '⋯ ' : '✓ ', color: failed > 0 ? C.red : pending > 0 ? C.yellow : C.green },
          { text: L.git.checks(passed, failed, pending), dim: true },
        ]),
      )
    }
    rows.push(<Link href={pr.url} label={truncate(pr.url, width)} />)
  }

  const counts: Part[] = []
  if (git.conflicts > 0) counts.push({ text: `${L.git.conflicts(git.conflicts)}  `, color: C.red, bold: true })
  if (git.staged > 0) counts.push({ text: `${L.git.staged(git.staged)}  `, color: C.green })
  if (git.changed > 0) counts.push({ text: `${L.git.changed(git.changed)}  `, color: C.yellow })
  if (git.untracked > 0) counts.push({ text: L.git.untracked(git.untracked), dim: true })
  rows.push(title(el, L.git.changes))
  if (counts.length === 0) {
    rows.push(Line(el, [{ text: '✓ ', color: C.green }, { text: L.git.clean, dim: true }]))
  } else {
    rows.push(Line(el, counts))
    const shown = git.files.slice(0, 12)
    for (const f of shown) {
      rows.push(Line(el, [{ ...tone(f.code), text: ` ${f.code} ` }, { text: truncate(f.path, width - 4) }]))
    }
    const more = git.staged + git.changed + git.untracked + git.conflicts - shown.length
    if (more > 0) rows.push(<Text dimColor>{`   ${L.git.more(more)}`}</Text>)
    if (hasInput && Input !== undefined) {
      rows.push(
        <Box marginTop={1}>
          <Input key="git-commit" value="" label="✎ " placeholder={L.git.commitPlaceholder} submitLabel={L.git.commitLabel} onSubmit={value => on.commit(value)} />
        </Box>,
      )
    }
  }

  if (git.commits.length > 0) {
    rows.push(title(el, L.git.commits))
    for (const c of git.commits) {
      const when = now - c.at < 7 * 86_400_000 ? compact(now - c.at) : new Date(c.at).toLocaleDateString()
      rows.push(
        Line(el, [
          { text: `${c.hash} `, color: C.yellow },
          { text: truncate(c.subject, Math.max(10, width - c.hash.length - when.length - 3)) },
          { text: ` ${when}`, dim: true },
        ]),
      )
    }
  }

  const isArmed = snap.confirm?.key === 'stash' && snap.confirm.until >= now
  rows.push(
    <Box marginTop={1} flexDirection="row" columnGap={2}>
      {refresh}
      {counts.length > 0 || git.stashes > 0 ? (
        <Button key="git-stash" label={isArmed ? L.git.stashConfirm : L.git.stash(git.stashes)} hotkey="s" {...(isArmed ? { variant: 'primary' as const } : {})} onPress={() => on.stash()} />
      ) : null}
    </Box>,
  )
  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- tasks & focus

function tasksTab(el: El, snap: Snapshot, width: number, hasInput: boolean, on: Handlers): RenderElement {
  const { Box, Button, Text } = el
  const { todos, focus, plan, now } = snap
  const Input = 'Input' in el ? el.Input : undefined
  const rows: RenderElement[] = []

  rows.push(title(el, L.tasks.focus))
  if (focus !== null) {
    const isDone = focus.minutes > 0 && focus.isNotified
    const elapsed = now - focus.startedAt
    rows.push(Line(el, [{ text: '◎ ', color: C.accent }, { text: truncate(focus.goal, width - 4), bold: true }]))
    if (focus.minutes > 0 && !isDone) {
      rows.push(Line(el, barParts(Math.min(100, (elapsed / (focus.minutes * 60_000)) * 100), Math.max(8, Math.min(30, width - 20)), C.accent)))
    }
    rows.push(
      Line(el, [
        {
          text: isDone
            ? L.tasks.done
            : focus.minutes > 0
              ? L.tasks.left(clock(focus.minutes * 60_000 - elapsed), focus.minutes)
              : L.tasks.open(clock(elapsed)),
          color: isDone ? C.green : undefined,
          dim: !isDone,
        },
      ]),
    )
    rows.push(
      <Box marginTop={1}>
        <Button key="focus-stop" label={L.tasks.stop} hotkey="s" onPress={() => on.stopFocus()} />
      </Box>,
    )
  } else if (hasInput && Input !== undefined) {
    rows.push(
      <Input
        key="focus-goal"
        value=""
        label="◎ "
        placeholder={L.tasks.focusPlaceholder(snap.pomodoroMinutes)}
        submitLabel={L.tasks.start}
        onSubmit={value => on.startFocus(value)}
      />,
    )
  } else {
    rows.push(<Text dimColor>{L.tasks.noInput}</Text>)
  }

  if (plan.length > 0) {
    const done = plan.filter(p => p.status === 'completed').length
    rows.push(title(el, L.tasks.plan, `${done}/${plan.length}`))
    for (const p of plan.slice(0, 12)) {
      const mark = p.status === 'completed' ? { text: '✓ ', color: C.green } : p.status === 'in_progress' ? { text: '▸ ', color: C.cyan } : { text: '○ ', dim: true }
      rows.push(
        Line(el, [
          mark,
          {
            text: truncate(p.status === 'in_progress' ? p.active || p.text : p.text, width - 3),
            dim: p.status === 'completed',
            bold: p.status === 'in_progress',
          },
        ]),
      )
    }
  }

  const done = todos.filter(t => t.done).length
  rows.push(title(el, L.tasks.list, todos.length > 0 ? `${done}/${todos.length}` : undefined))
  if (hasInput && Input !== undefined) {
    rows.push(
      <Input key="todo-new" value="" label="+ " placeholder={L.tasks.addPlaceholder} submitLabel={L.tasks.add} onSubmit={value => on.addTodo(value)} />,
    )
  }
  if (todos.length === 0) rows.push(<Text dimColor>{L.tasks.empty}</Text>)

  // important first, then in the order added; done ones last
  const order = [...todos].sort(
    (a, b) => Number(a.done) - Number(b.done) || (a.done ? 0 : Number(b.isHigh === true) - Number(a.isHigh === true)) || a.id - b.id,
  )
  for (const t of order) {
    const marks: RenderElement[] = []
    if (t.isHigh === true && !t.done) marks.push(<Text color={C.red} bold>{'! '}</Text>)
    rows.push(
      <Box flexDirection="row" key={`row-${t.id}`}>
        {marks}
        <Button
          key={`todo-${t.id}`}
          label={`${t.done ? '☑' : '☐'} ${truncate(t.text, width - 10)}`}
          plain
          dimColor={t.done}
          onPress={() => on.toggleTodo(t.id)}
        />
        {t.isGlobal === true ? <Text color={C.cyan}>{' ◆'}</Text> : null}
        {t.by === 'claude' ? <Text color={C.accent}>{' ✦'}</Text> : null}
      </Box>,
    )
  }
  if (done > 0) {
    rows.push(
      <Box marginTop={1}>
        <Button key="todo-clear" label={L.tasks.clear} hotkey="c" onPress={() => on.clearDone()} />
      </Box>,
    )
  }
  if (todos.some(t => t.by === 'claude' || t.isGlobal === true || t.isHigh === true)) {
    rows.push(<Text dimColor>{L.tasks.legend}</Text>)
  }

  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- tests

function testsTab(el: El, snap: Snapshot, width: number, on: Handlers): RenderElement {
  const { Box, Button, Text } = el
  const { tests, now } = snap
  const rows: RenderElement[] = []

  const status: Part[] =
    tests.status === 'running'
      ? [
          { text: L.tests.running, color: C.yellow, bold: true },
          { text: `  ${duration(now - (tests.startedAt ?? now))}`, dim: true },
        ]
      : tests.status === 'pass'
        ? [{ text: L.tests.pass, color: C.green, bold: true }]
        : tests.status === 'fail'
          ? [{ text: L.tests.fail, color: C.red, bold: true }]
          : [{ text: L.tests.never, dim: true }]

  if (tests.status === 'pass' || tests.status === 'fail') {
    const bits: string[] = []
    if (tests.total !== undefined) bits.push(L.tests.of(tests.passed ?? 0, tests.total))
    if (tests.failed !== undefined && tests.failed > 0) bits.push(L.tests.failedN(tests.failed))
    if (tests.ms !== undefined) bits.push(duration(tests.ms))
    if (tests.at !== undefined) bits.push(ago(tests.at, now))
    if (tests.by === 'claude') bits.push(L.tests.byClaude)
    if (tests.by === 'auto') bits.push(L.tests.byAuto)
    status.push({ text: `  ${bits.join(' · ')}`, dim: true })
  }
  rows.push(<Box marginTop={1}>{Line(el, status)}</Box>)
  rows.push(
    tests.command !== null ? (
      Line(el, [
        { text: '$ ', dim: true },
        { text: truncate(tests.command, width - 2) },
      ])
    ) : (
      <Text dimColor>{L.tests.noCommand}</Text>
    ),
  )
  if (snap.autoTests) rows.push(<Text dimColor>{`↻ ${L.tests.auto}`}</Text>)

  rows.push(
    <Box marginTop={1} flexDirection="row" columnGap={2}>
      <Button
        key="tests-run"
        label={tests.status === 'running' ? L.tests.runningBtn : L.tests.run}
        hotkey="t"
        variant="primary"
        onPress={() => on.runTests()}
      />
      {tests.status === 'fail' ? <Button key="tests-fix" label={L.tests.fixAll} hotkey="f" onPress={() => on.askToFix()} /> : null}
    </Box>,
  )

  if (tests.history.length > 1) {
    rows.push(title(el, L.tests.history))
    rows.push(
      Line(el, tests.history.slice(-Math.max(5, width - 2)).map(r => ({ text: '●', color: r.status === 'pass' ? C.green : C.red }))),
    )
  }

  if (tests.status === 'fail' && tests.failures.length > 0) {
    rows.push(title(el, L.tests.failures, String(tests.failures.length)))
    tests.failures.slice(0, 10).forEach((name, i) => {
      rows.push(
        <Box flexDirection="row" key={`fail-row-${i}`}>
          <Text color={C.red}>{'✗ '}</Text>
          <Button key={`fail-${i}`} label={truncate(name, width - 4)} plain hover={{ scope: `fail-${i}`, underline: true, color: C.red }} onPress={() => on.askToFix([name])} />
        </Box>,
      )
    })
  }

  if (tests.tail !== '') {
    rows.push(title(el, L.tests.output, L.tests.outputHint))
    for (const line of tests.tail.split('\n').slice(-12)) {
      const isBad = /\b(FAIL|FAILED|Error|failed)\b|[✗✕×]|panicked/.test(line)
      const isGood = /\b(PASS|passed|ok)\b|✓/.test(line)
      rows.push(
        <Text color={isBad ? C.red : isGood ? C.green : undefined} dimColor={!isBad && !isGood} wrap="truncate-end">
          {line === '' ? ' ' : line}
        </Text>,
      )
    }
  }

  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- pet

function petTab(el: El, snap: Snapshot, width: number, on: Handlers): RenderElement {
  const { Box, Button, Text } = el
  const { pet, prefs, live, tests, focus, turns, stats, now } = snap
  const m = mood({
    isWorking: live !== null,
    isTestsRed: tests.status === 'fail',
    isFocused: focus !== null,
    idleMs: now - (turns.history.at(-1)?.at ?? now),
    sinceUnlockMs: pet.lastUnlock === null ? Infinity : now - pet.lastUnlockAt,
  })
  const lv = level(pet.xp)
  const run = streak(stats, now)

  // a picture where the terminal draws one, the drawing in text elsewhere
  const Image = 'Image' in el ? el.Image : undefined
  const sprite = m === 'sleep' ? 'sleep' : m === 'sad' ? 'sad' : m === 'work' ? 'work' : 'happy'
  const picture =
    snap.canImage && Image !== undefined ? (
      <Image key="cat" source={{ png: CAT_PNG[sprite] }} columns={10} rows={4} alt={art(m, now).join(' ')} />
    ) : (
      <Box flexDirection="column">
        {art(m, now).map(line => (
          <Text color={C.accent}>{line}</Text>
        ))}
      </Box>
    )

  const card = (
    <Box flexDirection="row" columnGap={3} marginTop={1}>
      {picture}
      <Box flexDirection="column">
        {Line(el, [
          { text: L.tabs.pet, bold: true },
          { text: ` · ${L.pet.level(lv.level)}`, color: C.accent },
        ])}
        {Line(el, [
          ...barParts((lv.into / lv.span) * 100, Math.max(6, Math.min(16, width - 30))),
          { text: ` ${L.pet.xp(lv.into, lv.span)}`, dim: true },
        ])}
        <Text dimColor>{L.pet.moods[m]}</Text>
        {run > 1 ? <Text color={C.yellow}>{`✦ ${L.pet.streak(run)}`}</Text> : null}
      </Box>
    </Box>
  )

  const list = achievements()
  const rows: RenderElement[] = [card]
  rows.push(title(el, L.pet.achievements, `${pet.achievements.filter(id => list.some(a => a.id === id)).length}/${list.length}`))
  const nameWidth = Math.max(...list.map(a => a.title.length)) + 2
  // unlocked first, then the next few to aim for; the rest wait
  const unlocked = list.filter(a => pet.achievements.includes(a.id))
  const locked = list.filter(a => !pet.achievements.includes(a.id))
  const shown = [...unlocked, ...locked.slice(0, 4)]
  for (const a of shown) {
    const has = pet.achievements.includes(a.id)
    rows.push(
      Line(el, [
        { text: has ? '★ ' : '☆ ', color: has ? C.yellow : undefined, dim: !has },
        { text: a.title.padEnd(nameWidth), bold: has, dim: !has },
        { text: truncate(a.hint, Math.max(10, width - nameWidth - 2)), dim: true },
      ]),
    )
  }

  if (locked.length > 4) rows.push(<Text dimColor>{`  ${L.pet.moreLocked(locked.length - 4)}`}</Text>)

  rows.push(title(el, L.pet.grows))
  rows.push(<Text dimColor>{L.pet.growsLine(XP.turn, XP.testsGreen, XP.todoDone, XP.focusDone, XP.achievement)}</Text>)
  rows.push(<Text dimColor>{L.pet.totals(pet.totals.turns, pet.totals.tools, pet.totals.todosDone)}</Text>)
  rows.push(
    <Box marginTop={1}>
      <Button key="pet-toggle" label={prefs.isPetShown ? L.pet.hide : L.pet.show} hotkey="p" onPress={() => on.togglePet()} />
    </Box>,
  )
  return <Box flexDirection="column">{rows}</Box>
}
