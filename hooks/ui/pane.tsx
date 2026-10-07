// The dashboard pane: five tabs (keys 1-5 while it holds the keyboard), each
// a grid of rounded cards, two across when the pane is wide enough. Where the
// surface draws cells (the terminal) or SVG (desktop, VS Code, phone) gauges
// are rings and Tabby is pixel art; elsewhere the same facts read as bars and text.
import type { RenderElement } from 'claude-code'

import type { TabId } from '../../types'
import { REPO, VERSION } from '../lib/about'
import { frameAt } from '../lib/anim'
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
  tokens,
  truncate,
  until,
} from '../lib/format'
import { burn, contextGrowth, turnsLeft } from '../lib/forecast'
import { fileTone } from '../lib/git'
import { L } from '../lib/i18n'
import type { Part } from '../lib/layout'
import { achievements, art, level, mood, XP } from '../lib/pet'
import type { Mood } from '../lib/pet'
import { along, bigText, css, mix, rgb, ring, squares, toCells } from '../lib/pixels'
import { bigCat } from '../lib/sprites'
import { bigTextSvg, ringSvg, squaresSvg } from '../lib/svg'
import { dayKey, lastDays, streak } from '../lib/stats'
import type { Handlers, Snapshot } from '../snapshot'
import { barParts, CatSvg, Line, merge } from './parts'
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

// ---------------------------------------------------------------- building blocks

type Ctx = { el: El; snap: Snapshot; width: number; hasInput: boolean; on: Handlers }

/** How wide each card is: two across from 76 columns, else the full width. */
function cardWidth(width: number, span: 1 | 2 = 1): number {
  return width >= 76 && span === 1 ? Math.floor((width - 1) / 2) : width
}

/** The room inside a card of `w`: its frame and a cell of padding each side. */
function inner(w: number): number {
  return w - 4
}

function Card(
  el: El,
  key: string,
  title: string,
  w: number,
  body: readonly (RenderElement | null)[],
  opts: { extra?: string; isAlert?: boolean } = {},
): RenderElement {
  const { Box, Text } = el
  return (
    <Box key={key} flexDirection="column" width={w} borderStyle="round" borderColor={opts.isAlert === true ? C.alert : C.border} paddingX={1}>
      <Box flexDirection="row">
        <Text bold color={opts.isAlert === true ? C.red : C.accent}>
          {title.toUpperCase()}
        </Text>
        {opts.extra !== undefined ? <Text dimColor>{`  ${opts.extra}`}</Text> : null}
      </Box>
      {body.filter((b): b is RenderElement => b !== null)}
    </Box>
  )
}

/** Cards side by side where they fit, with a blank row between rows of them. */
function Grid(el: El, width: number, cards: readonly (RenderElement | null)[]): RenderElement {
  const { Box } = el
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} width={width}>
      {cards.filter((c): c is RenderElement => c !== null)}
    </Box>
  )
}

/** A ring gauge with its figure in the middle; a bar where cells cannot be drawn. */
function Gauge(
  el: El,
  key: string,
  pct: number,
  size: number,
  label: string,
  fallbackWidth: number,
  color?: string,
  track?: string,
  labelColor?: string,
): RenderElement {
  const { Box, Text } = el
  const Raster = 'Raster' in el ? el.Raster : undefined
  const Svg = 'Svg' in el ? el.Svg : undefined
  if (Raster === undefined && Svg !== undefined) {
    const fill = rgb(color ?? heat(pct))
    const source = ringSvg(pct, size * 8, fill, rgb(track ?? C.track), label, rgb(labelColor ?? color ?? heat(pct)))
    return <Svg key={key} source={source} alt={`${label} · ${percent(pct)}`} />
  }
  if (Raster === undefined) return Line(el, [...barParts(pct, fallbackWidth, color), { text: ` ${label}`, color: color ?? heat(pct), bold: true }])
  const stops = [rgb(color ?? heat(pct))]
  const rows = Math.ceil(size / 2)
  const textWidth = Array.from(label).length
  return (
    <Box key={key} width={size} flexDirection="column">
      <Raster key={key} {...toCells(ring(pct, size, stops, rgb(track ?? C.track)))} />
      <Box position="absolute" top={Math.floor((rows - 1) / 2)} left={Math.floor((size - textWidth) / 2)}>
        <Text bold color={labelColor ?? color ?? heat(pct)}>
          {label}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Turn durations as block heights against the longest, coloured by how long
 * they took: quick turns cool, five minutes and more hot.
 */
function spark(values: readonly number[]): Part[] {
  const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
  const max = Math.max(...values, 1)
  return merge(
    values.map(v => ({
      text: SPARKS[Math.min(7, Math.floor((v / max) * 7.999))]!,
      color: css(along([rgb(C.cyan), rgb(C.accent), rgb(C.red)], Math.min(1, v / 300_000))),
    })),
  )
}

/** Days as squares, darker for quiet days and brighter for busy ones; 7 to a row. */
function heatmap(el: El, values: readonly number[]): RenderElement[] {
  const max = Math.max(...values, 1)
  const Raster = 'Raster' in el ? el.Raster : undefined
  if (Raster !== undefined) {
    const colorOf = (v: number) => (v === 0 ? rgb(C.track) : mix(rgb(C.track), rgb(C.accent), 0.35 + 0.65 * (v / max)))
    return [<Raster key="heatmap" {...toCells(squares(values, 7, colorOf))} />]
  }
  const Svg = 'Svg' in el ? el.Svg : undefined
  if (Svg !== undefined) {
    const colorOf = (v: number) => (v === 0 ? rgb(C.track) : mix(rgb(C.track), rgb(C.accent), 0.35 + 0.65 * (v / max)))
    return [<Svg key="heatmap" source={squaresSvg(values, 7, colorOf, 14)} alt={L.overview.today} />]
  }
  const rows: RenderElement[] = []
  for (let r = 0; r < values.length; r += 7) {
    const parts: Part[] = values.slice(r, r + 7).flatMap((v, i) => [
      ...(i > 0 ? [{ text: ' ' }] : []),
      { text: '██', color: v === 0 ? C.track : css(mix(rgb(C.track), rgb(C.accent), 0.35 + 0.65 * (v / max))) },
    ])
    rows.push(Line(el, parts))
  }
  return rows
}

// ---------------------------------------------------------------- the pane

export type PaneDrawn = { tree: RenderElement; mood: Mood; hasCat: boolean }

export function drawPane(el: El, snap: Snapshot, bodyColumns: number, hasInput: boolean, on: Handlers): PaneDrawn {
  const { Box, Button, Link, Text } = el
  const tab = snap.prefs.tab
  const width = Math.max(24, bodyColumns)
  const ctx: Ctx = { el, snap, width, hasInput, on }

  // tabs, with an accent line under the one shown: on the terminal a line of
  // cells; elsewhere the labels are in a proportional font, so the line hangs
  // under its own tab, as wide as the tab and clipped there
  const labels = TABS.map(t => `${L.tabs[t.id]}${badge(t.id, snap)}`)
  const tabButton = (t: (typeof TABS)[number], i: number) => (
    <Button key={`tab-${t.id}`} label={labels[i]!} hotkey={t.key} plain dimColor={tab !== t.id} onPress={() => on.setTab(t.id)} />
  )
  let header: RenderElement
  if ('Raster' in el) {
    let underline = ''
    TABS.forEach((t, i) => {
      const w = 3 + Array.from(labels[i]!).length
      underline += (i > 0 ? '  ' : '') + (t.id === tab ? '▔'.repeat(w) : ' '.repeat(w))
    })
    header = (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {TABS.map(tabButton)}
        </Box>
        <Text color={C.accent} wrap="truncate-end">
          {underline}
        </Text>
      </Box>
    )
  } else {
    header = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1} marginBottom={1}>
        {TABS.map((t, i) => (
          <Box key={`tabbox-${t.id}`} flexDirection="column">
            {tabButton(t, i)}
            {t.id === tab ? (
              // longer than any font draws the tab; the box clips it, with no ellipsis
              <Box position="absolute" top={1} left={0} right={0} height={1} overflow="hidden">
                <Text color={C.accent}>{'▔'.repeat(2 * (3 + Array.from(labels[i]!).length))}</Text>
              </Box>
            ) : null}
          </Box>
        ))}
      </Box>
    )
  }

  let body: RenderElement
  let paneMood: Mood = 'happy'
  let hasCat = false
  if (tab === 'git') body = gitTab(ctx)
  else if (tab === 'tasks') body = tasksTab(ctx)
  else if (tab === 'tests') body = testsTab(ctx)
  else if (tab === 'pet') {
    const drawn = petTab(ctx)
    body = drawn.tree
    paneMood = drawn.mood
    hasCat = drawn.hasCat
  } else body = overviewTab(ctx)

  const tree = (
    <Box flexDirection="column" width={width}>
      {header}
      {body}
      <Text dimColor wrap="wrap">
        {L.hint[tab]}
      </Text>
      {/* the Tabby tab ends with which version this is and where it lives:
          one quiet line under the keys, a row of room above */}
      {tab === 'pet' ? (
        <Box marginTop={1} flexDirection="row">
          <Text dimColor>{`Tabby ${VERSION} · `}</Text>
          <Link href={REPO} label={REPO.replace('https://', '')} />
        </Box>
      ) : null}
    </Box>
  )
  return { tree, mood: paneMood, hasCat }
}

// ---------------------------------------------------------------- overview

function overviewTab({ el, snap, width }: Ctx): RenderElement {
  const { Box, Text } = el
  const { usage, turns, live, samples, stats, tests, git, now } = snap
  const half = cardWidth(width)
  const room = inner(half)

  // what needs attention, or a calm word
  const warns: string[] = []
  if ((usage?.percent ?? 0) >= 85) warns.push(L.overview.warnContext)
  for (const l of usage?.limits ?? []) {
    if (burn(samples, l.kind, now, until(l.resetsAt, now))?.runsOutInMs !== undefined) warns.push(L.overview.warnLimit(limitLabel(l.kind)))
  }
  if (tests.status === 'fail') warns.push(L.overview.warnTests)
  if ((git?.conflicts ?? 0) > 0) warns.push(L.overview.warnConflicts)
  const status = (
    <Box marginTop={1} marginBottom={1} flexDirection="row">
      {warns.length === 0
        ? Line(el, [{ text: ' ✓ ', color: C.green, bold: true }, { text: L.overview.allCalm }])
        : Line(el, [{ text: ' ⚠ ', color: C.red, bold: true }, { text: warns.join(' · '), color: C.red }])}
    </Box>
  )

  // context: a ring and its figures
  let contextCard: RenderElement
  if (usage === null || usage.percent === undefined) {
    contextCard = Card(el, 'card-context', L.overview.context, half, [
      <Text dimColor wrap="wrap">
        {L.overview.freshWindow(usage !== null ? tokens(usage.window) : '—')}
      </Text>,
    ])
  } else {
    const pct = usage.percent
    const growth = contextGrowth(turns.history)
    const left = turnsLeft(usage.tokens, usage.window, growth)
    const facts = (
      <Box flexDirection="column" marginLeft={2} width={Math.max(10, room - 14)}>
        <Text bold>{tokens(usage.tokens ?? 0)}</Text>
        <Text dimColor>{L.overview.tokensOf('', tokens(usage.window)).trim()}</Text>
        {growth !== undefined && left !== undefined ? (
          <Text color={left <= 5 ? C.red : undefined} dimColor={left > 5}>{`+${tokens(growth)}/${L.band.turn} · ${L.band.turnsLeft(left)}`}</Text>
        ) : null}
        {pct >= 85 ? <Text color={C.red}>{'⚠ /compact'}</Text> : null}
      </Box>
    )
    contextCard = Card(
      el,
      'card-context',
      L.overview.context,
      half,
      [
        <Box flexDirection="row" marginTop={1}>
          {Gauge(el, 'ring-context', pct, 12, percent(pct), Math.max(6, room - 14))}
          {facts}
        </Box>,
      ],
      { isAlert: pct >= 85 },
    )
  }

  // limits: a ring each, side by side
  let limitsCard: RenderElement
  if (usage === null || usage.limits.length === 0) {
    limitsCard = Card(el, 'card-limits', L.overview.limits, half, [
      <Text dimColor wrap="wrap">
        {L.overview.noLimits}
      </Text>,
    ])
  } else {
    // rings side by side where they draw (cells or SVG); bars stacked elsewhere
    const isRaster = 'Raster' in el || 'Svg' in el
    const items = usage.limits.slice(0, 3).map(l => {
      const left = until(l.resetsAt, now)
      const b = burn(samples, l.kind, now, left)
      const label = limitLabel(l.kind)
      if (!isRaster) {
        return (
          <Box flexDirection="column" key={`limit-${l.kind}`}>
            {Line(el, [{ text: `${label.padEnd(3)}`, bold: true }, ...barParts(l.percent, Math.max(6, room - 9)), { text: ` ${percent(l.percent)}`, color: heat(l.percent), bold: true }])}
            {left !== undefined ? <Text dimColor>{`   ${L.overview.resetIn(duration(left))}`}</Text> : null}
            {b?.runsOutInMs !== undefined ? <Text color={C.red}>{`   ${L.overview.runsOut(duration(b.runsOutInMs))}`}</Text> : null}
          </Box>
        )
      }
      return (
        <Box flexDirection="column" key={`limit-${l.kind}`} width={12} alignItems="center">
          {Gauge(el, `ring-${l.kind}`, l.percent, 10, percent(l.percent), 0)}
          <Text bold>{label}</Text>
          <Text dimColor>{left !== undefined ? `↻ ${compact(left)}` : ' '}</Text>
          {b?.runsOutInMs !== undefined ? <Text color={C.red}>{`⚠ ${compact(b.runsOutInMs)}`}</Text> : null}
        </Box>
      )
    })
    const isAlert = usage.limits.some(l => l.percent >= 85 || burn(samples, l.kind, now, until(l.resetsAt, now))?.runsOutInMs !== undefined)
    limitsCard = Card(
      el,
      'card-limits',
      L.overview.limits,
      half,
      [
        <Box flexDirection={isRaster ? 'row' : 'column'} columnGap={2} marginTop={1}>
          {items}
        </Box>,
      ],
      { isAlert },
    )
  }

  // today: the figures and four weeks of activity
  const today = stats.days[dayKey(now)]
  const days = lastDays(stats, now, 28)
  const run = streak(stats, now)
  const facts: string[] = [L.turns(today?.turns ?? 0)]
  if ((today?.focusMs ?? 0) >= 60_000) facts.push(`◎ ${compact(today?.focusMs ?? 0)}`)
  if (snap.showCost && (today?.costUsd ?? 0) >= 0.005) facts.push(money(today?.costUsd ?? 0))
  const todayCard = Card(el, 'card-today', L.overview.today, half, [
    <Text>{facts.join(' · ')}</Text>,
    run > 1 ? <Text color={C.yellow}>{`✦ ${L.overview.streak(run)}`}</Text> : null,
    <Box flexDirection="column" marginTop={1}>
      {heatmap(el, days.map(d => d.day.turns))}
    </Box>,
  ])

  // the session and its turns
  const history = turns.history.slice(-Math.max(5, Math.min(40, room)))
  const costs = turns.history.map(t => t.costUsd).filter((c): c is number => c !== undefined)
  const avgCost = costs.length > 0 ? costs.reduce((s, c) => s + c, 0) / costs.length : 0
  const sessionFacts: string[] = []
  if (usage !== null) sessionFacts.push(duration(now - usage.startedAt))
  sessionFacts.push(L.turns(turns.count))
  sessionFacts.push(L.overview.tools(turns.tools))
  if (snap.showCost && usage?.costUsd !== undefined && usage.costUsd >= 0.005) sessionFacts.push(money(usage.costUsd))
  if (snap.showCost && avgCost >= 0.005) sessionFacts.push(L.overview.perTurnCost(money(avgCost)))
  const last = history.at(-1)
  const sessionCard = Card(el, 'card-session', L.overview.session, half, [
    <Text wrap="wrap">{sessionFacts.join(' · ')}</Text>,
    live !== null
      ? Line(el, [
          { text: '● ', color: C.accent },
          { text: L.overview.liveTurn(duration(now - live.startedAt)), bold: true },
          { text: ` · ${live.tools} ${L.band.tools}`, dim: true },
        ])
      : null,
    history.length > 0 ? <Box marginTop={1}>{Line(el, spark(history.map(t => t.ms)))}</Box> : null,
    history.length > 0
      ? (
        <Text dimColor wrap="wrap">
          {L.overview.avg(
            compact(history.reduce((s, t) => s + t.ms, 0) / history.length),
            compact(Math.max(...history.map(t => t.ms))),
            (history.reduce((s, t) => s + t.tools, 0) / history.length).toFixed(1),
          )}
        </Text>
      )
      : null,
    last !== undefined
      ? (
        <Text dimColor wrap="wrap">
          {`${L.overview.last}: ${duration(last.ms)} · ${last.tools} ${L.band.tools}${last.errors > 0 ? ` · ${last.errors} ${L.band.errors}` : ''}${last.tokens > 0 ? ` · ${tokens(last.tokens)} ${L.band.tok}` : ''}${snap.showCost && last.costUsd !== undefined && last.costUsd >= 0.005 ? ` · ${money(last.costUsd)}` : ''}`}
        </Text>
      )
      : null,
  ])

  return (
    <Box flexDirection="column">
      {status}
      {Grid(el, width, [contextCard, limitsCard, todayCard, sessionCard])}
    </Box>
  )
}

// ---------------------------------------------------------------- git

function gitTab({ el, snap, width, hasInput, on }: Ctx): RenderElement {
  const { Box, Button, Text, Link } = el
  const { git, now } = snap
  const Input = 'Input' in el ? el.Input : undefined
  const half = cardWidth(width)
  const refresh = <Button key="git-refresh" label={L.git.refresh} hotkey="r" onPress={() => on.refreshGit()} />

  if (git === null) {
    return (
      <Box flexDirection="column" marginTop={1}>
        {Card(el, 'card-git', 'Git', width, [<Text dimColor>{L.git.noRepo}</Text>, <Box marginTop={1}>{refresh}</Box>])}
      </Box>
    )
  }

  // the branch, its upstream and its pull request
  const branch: (RenderElement | null)[] = [
    Line(el, [{ text: '⎇ ', color: C.purple }, { text: git.branch, color: C.purple, bold: true }]),
    git.upstream !== null
      ? Line(el, [
          { text: `→ ${git.upstream}`, dim: true },
          ...(git.ahead > 0 ? [{ text: `  ↑${git.ahead}`, color: C.green, bold: true }] : []),
          ...(git.behind > 0 ? [{ text: `  ↓${git.behind}`, color: C.red, bold: true }] : []),
        ])
      : null,
    <Text dimColor wrap="truncate-end">{`${git.repo ?? L.git.local} · ${L.git.updated(ago(git.at, now))}`}</Text>,
  ]
  if (git.pr !== null) {
    const pr = git.pr
    const { passed, failed, pending } = pr.checks
    branch.push(
      <Box marginTop={1} flexDirection="column">
        {Line(el, [
          { text: ` PR #${pr.number} `, color: '#FFFFFF', bg: C.blue, bold: true },
          ...(pr.isDraft ? [{ text: ` ${L.git.draft}`, dim: true }] : []),
        ])}
        <Text wrap="truncate-end">{truncate(pr.title, inner(half))}</Text>
        {passed + failed + pending > 0
          ? Line(el, [
              { text: failed > 0 ? '✗ ' : pending > 0 ? '⋯ ' : '✓ ', color: failed > 0 ? C.red : pending > 0 ? C.yellow : C.green, bold: true },
              { text: L.git.checks(passed, failed, pending), dim: true },
            ])
          : null}
        <Link href={pr.url} label={truncate(pr.url, inner(half))} />
      </Box>,
    )
  }
  const branchCard = Card(el, 'card-branch', L.git.branch, half, branch, { isAlert: git.conflicts > 0 })

  // the working tree and what to do with it
  const counts: Part[] = []
  if (git.conflicts > 0) counts.push({ text: `${L.git.conflicts(git.conflicts)}  `, color: C.red, bold: true })
  if (git.staged > 0) counts.push({ text: `${L.git.staged(git.staged)}  `, color: C.green })
  if (git.changed > 0) counts.push({ text: `${L.git.changed(git.changed)}  `, color: C.yellow })
  if (git.untracked > 0) counts.push({ text: L.git.untracked(git.untracked), dim: true })
  const shown = git.files.slice(0, 10)
  const more = git.staged + git.changed + git.untracked + git.conflicts - shown.length
  const isArmed = snap.confirm?.key === 'stash' && snap.confirm.until >= now
  const changes: (RenderElement | null)[] =
    counts.length === 0
      ? [Line(el, [{ text: '✓ ', color: C.green }, { text: L.git.clean, dim: true }])]
      : [
          Line(el, counts),
          ...shown.map(f => Line(el, [{ ...tone(f.code), text: ` ${f.code} ` }, { text: truncate(f.path, inner(half) - 3) }])),
          more > 0 ? <Text dimColor>{`   ${L.git.more(more)}`}</Text> : null,
          hasInput && Input !== undefined ? (
            <Box marginTop={1}>
              <Input key="git-commit" value="" label="✎ " placeholder={L.git.commitPlaceholder} submitLabel={L.git.commitLabel} onSubmit={value => on.commit(value)} />
            </Box>
          ) : null,
        ]
  changes.push(
    <Box marginTop={1} flexDirection="row" columnGap={2}>
      {refresh}
      {counts.length > 0 || git.stashes > 0 ? (
        <Button key="git-stash" label={isArmed ? L.git.stashConfirm : L.git.stash(git.stashes)} hotkey="s" {...(isArmed ? { variant: 'primary' as const } : {})} onPress={() => on.stash()} />
      ) : null}
    </Box>,
  )
  const changesCard = Card(el, 'card-changes', L.git.changes, half, changes)

  const commitsCard =
    git.commits.length > 0
      ? Card(
          el,
          'card-commits',
          L.git.commits,
          width,
          git.commits.map(c => {
            const when = now - c.at < 7 * 86_400_000 ? compact(now - c.at) : new Date(c.at).toLocaleDateString()
            return Line(el, [
              { text: `${c.hash} `, color: C.yellow },
              { text: truncate(c.subject, Math.max(10, inner(width) - c.hash.length - when.length - 3)) },
              { text: ` ${when}`, dim: true },
            ])
          }),
        )
      : null

  return <Box flexDirection="column" marginTop={1}>{Grid(el, width, [branchCard, changesCard, commitsCard])}</Box>
}

// ---------------------------------------------------------------- tasks & focus

function tasksTab({ el, snap, width, hasInput, on }: Ctx): RenderElement {
  const { Box, Button, Text } = el
  const { todos, focus, plan, now } = snap
  const Input = 'Input' in el ? el.Input : undefined
  const Raster = 'Raster' in el ? el.Raster : undefined
  const Svg = 'Svg' in el ? el.Svg : undefined
  const half = cardWidth(width)

  // focus: a big clock and a progress bar
  const focusBody: (RenderElement | null)[] = []
  if (focus !== null) {
    const isDone = focus.minutes > 0 && focus.isNotified
    const elapsed = now - focus.startedAt
    const shown = focus.minutes > 0 ? clock(Math.max(0, focus.minutes * 60_000 - elapsed)) : clock(elapsed)
    focusBody.push(Line(el, [{ text: '◎ ', color: C.accent }, { text: truncate(focus.goal, inner(half) - 2), bold: true }]))
    if (isDone) focusBody.push(<Text color={C.green} bold>{`✓ ${L.tasks.done}`}</Text>)
    else if (Raster !== undefined) {
      focusBody.push(
        <Box marginTop={1}>
          <Raster key="focus-clock" {...toCells(bigText(shown, rgb(C.accent)))} />
        </Box>,
      )
    } else if (Svg !== undefined) {
      focusBody.push(
        <Box marginTop={1}>
          <Svg key="focus-clock" source={bigTextSvg(shown, rgb(C.accent), 44)} alt={shown} />
        </Box>,
      )
    }
    if (focus.minutes > 0 && !isDone) {
      focusBody.push(Line(el, barParts(Math.min(100, (elapsed / (focus.minutes * 60_000)) * 100), Math.max(8, inner(half)), C.accent)))
    }
    if (!isDone) {
      focusBody.push(
        <Text dimColor>{focus.minutes > 0 ? L.tasks.left(clock(focus.minutes * 60_000 - elapsed), focus.minutes) : L.tasks.open(clock(elapsed))}</Text>,
      )
    }
    focusBody.push(
      <Box marginTop={1}>
        <Button key="focus-stop" label={L.tasks.stop} hotkey="s" onPress={() => on.stopFocus()} />
      </Box>,
    )
  } else if (hasInput && Input !== undefined) {
    focusBody.push(
      <Input key="focus-goal" value="" label="◎ " placeholder={L.tasks.focusPlaceholder(snap.pomodoroMinutes)} submitLabel={L.tasks.start} onSubmit={value => on.startFocus(value)} />,
    )
  } else {
    focusBody.push(<Text dimColor>{L.tasks.noInput}</Text>)
  }
  const focusCard = Card(el, 'card-focus', L.tasks.focus, half, focusBody)

  // Claude's own plan
  const planDone = plan.filter(p => p.status === 'completed').length
  const planCard = Card(
    el,
    'card-plan',
    L.tasks.plan,
    half,
    plan.length === 0
      ? [<Text dimColor wrap="wrap">{L.tasks.planEmpty}</Text>]
      : [
          Line(el, barParts((planDone / plan.length) * 100, Math.max(6, inner(half)), C.cyan)),
          ...plan.slice(0, 10).map(p => {
            const mark = p.status === 'completed' ? { text: '✓ ', color: C.green } : p.status === 'in_progress' ? { text: '▸ ', color: C.cyan } : { text: '○ ', dim: true }
            return Line(el, [
              mark,
              { text: truncate(p.status === 'in_progress' ? p.active || p.text : p.text, inner(half) - 2), dim: p.status === 'completed', bold: p.status === 'in_progress' },
            ])
          }),
        ],
    { extra: plan.length > 0 ? `${planDone}/${plan.length}` : undefined },
  )

  // the list: important first, then in the order added; done ones last
  const done = todos.filter(t => t.done).length
  const order = [...todos].sort(
    (a, b) => Number(a.done) - Number(b.done) || (a.done ? 0 : Number(b.isHigh === true) - Number(a.isHigh === true)) || a.id - b.id,
  )
  const listBody: (RenderElement | null)[] = [
    hasInput && Input !== undefined ? (
      <Input key="todo-new" value="" label="+ " placeholder={L.tasks.addPlaceholder} submitLabel={L.tasks.add} onSubmit={value => on.addTodo(value)} />
    ) : null,
    done > 0 ? Line(el, barParts((done / todos.length) * 100, Math.max(6, inner(width)), C.blue)) : null,
    todos.length === 0 ? <Text dimColor wrap="wrap">{L.tasks.empty}</Text> : null,
    ...order.map(t => (
      <Box flexDirection="row" key={`row-${t.id}`}>
        {t.isHigh === true && !t.done ? <Text color={C.red} bold>{'! '}</Text> : null}
        <Button key={`todo-${t.id}`} label={`${t.done ? '☑' : '☐'} ${truncate(t.text, inner(width) - 8)}`} plain dimColor={t.done} onPress={() => on.toggleTodo(t.id)} />
        {t.isGlobal === true ? <Text color={C.cyan}>{' ◆'}</Text> : null}
        {t.by === 'claude' ? <Text color={C.accent}>{' ✦'}</Text> : null}
      </Box>
    )),
    done > 0 ? (
      <Box marginTop={1}>
        <Button key="todo-clear" label={L.tasks.clear} hotkey="c" onPress={() => on.clearDone()} />
      </Box>
    ) : null,
    todos.some(t => t.by === 'claude' || t.isGlobal === true || t.isHigh === true) ? <Text dimColor>{L.tasks.legend}</Text> : null,
  ]
  const listCard = Card(el, 'card-todo', L.tasks.list, width, listBody, { extra: todos.length > 0 ? `${done}/${todos.length}` : undefined })

  return <Box flexDirection="column" marginTop={1}>{Grid(el, width, [focusCard, planCard, listCard])}</Box>
}

// ---------------------------------------------------------------- tests

function testsTab({ el, snap, width, on }: Ctx): RenderElement {
  const { Box, Button, Text } = el
  const { tests, now } = snap
  const half = cardWidth(width)

  const isFail = tests.status === 'fail'
  const ratio = tests.total !== undefined && tests.total > 0 ? ((tests.passed ?? 0) / tests.total) * 100 : tests.status === 'pass' ? 100 : 0
  const head: Part[] =
    tests.status === 'running'
      ? [{ text: L.tests.running, color: C.yellow, bold: true }, { text: `  ${duration(now - (tests.startedAt ?? now))}`, dim: true }]
      : tests.status === 'pass'
        ? [{ text: L.tests.pass, color: C.green, bold: true }]
        : isFail
          ? [{ text: L.tests.fail, color: C.red, bold: true }]
          : [{ text: L.tests.never, dim: true }]
  const bits: string[] = []
  if (tests.status === 'pass' || isFail) {
    if (tests.total !== undefined) bits.push(L.tests.of(tests.passed ?? 0, tests.total))
    if (tests.failed !== undefined && tests.failed > 0) bits.push(L.tests.failedN(tests.failed))
    if (tests.ms !== undefined) bits.push(duration(tests.ms))
    if (tests.at !== undefined) bits.push(ago(tests.at, now))
    if (tests.by === 'claude') bits.push(L.tests.byClaude)
    if (tests.by === 'auto') bits.push(L.tests.byAuto)
  }
  const summary = (
    <Box flexDirection="column" marginLeft={tests.status === 'pass' || isFail ? 2 : 0} width={tests.status === 'pass' || isFail ? Math.max(10, inner(half) - 14) : inner(half)}>
      {Line(el, head)}
      {bits.length > 0 ? <Text dimColor wrap="wrap">{bits.join(' · ')}</Text> : null}
      {tests.command !== null ? Line(el, [{ text: '$ ', dim: true }, { text: truncate(tests.command, inner(half) - 16) }]) : <Text dimColor wrap="wrap">{L.tests.noCommand}</Text>}
      {snap.autoTests ? <Text dimColor>{`↻ ${L.tests.auto}`}</Text> : null}
    </Box>
  )
  const statusCard = Card(
    el,
    'card-tests',
    L.tabs.tests,
    half,
    [
      <Box flexDirection="row" marginTop={1}>
        {tests.status === 'pass' || isFail
          ? Gauge(el, 'ring-tests', ratio, 12, tests.total !== undefined ? `${tests.passed ?? 0}` : isFail ? '✗' : '✓', 0, C.green, isFail ? C.red : undefined, isFail ? C.red : C.green)
          : null}
        {summary}
      </Box>,
      tests.history.length > 1
        ? Line(el, [{ text: `${L.tests.history}  `, dim: true }, ...merge(tests.history.slice(-Math.max(5, inner(half) - 12)).map(r => ({ text: '●', color: r.status === 'pass' ? C.green : C.red })))])
        : null,
      <Box marginTop={1} flexDirection="row" columnGap={2}>
        <Button key="tests-run" label={tests.status === 'running' ? L.tests.runningBtn : L.tests.run} hotkey="t" variant="primary" onPress={() => on.runTests()} />
        {isFail ? <Button key="tests-fix" label={L.tests.fixAll} hotkey="f" onPress={() => on.askToFix()} /> : null}
      </Box>,
    ],
    { isAlert: isFail },
  )

  const failuresCard =
    isFail && tests.failures.length > 0
      ? Card(
          el,
          'card-failures',
          L.tests.failures,
          half,
          tests.failures.slice(0, 10).map((name, i) => (
            <Box flexDirection="row" key={`fail-row-${i}`}>
              <Text color={C.red}>{'✗ '}</Text>
              <Button key={`fail-${i}`} label={truncate(name, inner(half) - 2)} plain hover={{ scope: `fail-${i}`, underline: true, color: C.red }} onPress={() => on.askToFix([name])} />
            </Box>
          )),
          { extra: String(tests.failures.length), isAlert: true },
        )
      : null

  const outputCard =
    tests.tail !== ''
      ? Card(
          el,
          'card-output',
          L.tests.output,
          width,
          tests.tail
            .split('\n')
            .slice(-12)
            .map(line => {
              const isBad = /\b(FAIL|FAILED|Error|failed)\b|[✗✕×]|panicked/.test(line)
              const isGood = /\b(PASS|passed|ok)\b|✓/.test(line)
              return (
                <Text color={isBad ? C.red : isGood ? C.green : undefined} dimColor={!isBad && !isGood} wrap="truncate-end">
                  {line === '' ? ' ' : line}
                </Text>
              )
            }),
          { extra: L.tests.outputHint },
        )
      : null

  return <Box flexDirection="column" marginTop={1}>{Grid(el, width, [statusCard, failuresCard, outputCard])}</Box>
}

// ---------------------------------------------------------------- pet

function petTab({ el, snap, width, on }: Ctx): { tree: RenderElement; mood: Mood; hasCat: boolean } {
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
  const half = cardWidth(width)

  // pixels where cells draw, a picture in kitty and Ghostty, SVG off the terminal
  const Raster = 'Raster' in el ? el.Raster : undefined
  const Image = 'Image' in el ? el.Image : undefined
  const sprite = m === 'sleep' ? 'sleep' : m === 'sad' ? 'sad' : m === 'work' ? 'work' : 'happy'
  let picture: RenderElement
  let hasCat = false
  if (snap.canImage && Image !== undefined) {
    picture = <Image key="cat" source={{ png: CAT_PNG[sprite] }} columns={20} rows={8} alt={art(m, now).join(' ')} />
  } else if (Raster !== undefined) {
    picture = <Raster key="bigcat" {...toCells(bigCat(m, frameAt(m, now, 'big')))} />
    hasCat = true
  } else if ('Svg' in el) {
    picture = CatSvg(el, 'bigcat', m, 'big', now, snap.animate)!
  } else {
    picture = (
      <Box flexDirection="column">
        {art(m, now).map(line => (
          <Text color={C.accent}>{line}</Text>
        ))}
      </Box>
    )
  }

  const xpWidth = Math.max(8, Math.min(24, width - 30))
  const profile = Card(el, 'card-tabby', L.tabs.pet, width, [
    <Box flexDirection="row" columnGap={3} marginTop={1}>
      {picture}
      <Box flexDirection="column">
        {Line(el, [{ text: ` ${L.pet.level(lv.level).toUpperCase()} `, color: '#1B1B1F', bg: C.accent, bold: true }])}
        <Text> </Text>
        {Line(el, [...barParts((lv.into / lv.span) * 100, xpWidth, C.accent), { text: ` ${L.pet.xp(lv.into, lv.span)}`, dim: true }])}
        <Text>{L.pet.moods[m]}</Text>
        {run > 1 ? <Text color={C.yellow}>{`✦ ${L.pet.streak(run)}`}</Text> : null}
        <Text dimColor wrap="wrap">
          {L.pet.totals(pet.totals.turns, pet.totals.tools, pet.totals.todosDone)}
        </Text>
      </Box>
    </Box>,
  ])

  // achievements: what is open, and the next few to aim for
  const list = achievements()
  const unlocked = list.filter(a => pet.achievements.includes(a.id))
  const locked = list.filter(a => !pet.achievements.includes(a.id))
  const opened = Card(
    el,
    'card-unlocked',
    L.pet.achievements,
    half,
    unlocked.length === 0
      ? [<Text dimColor>—</Text>]
      : unlocked.map(a => Line(el, [{ text: '★ ', color: C.yellow }, { text: truncate(a.title, inner(half) - 2), bold: true }])),
    { extra: `${unlocked.length}/${list.length}` },
  )
  const next = Card(el, 'card-next', L.pet.next, half, [
    ...locked.slice(0, 4).map(a =>
      <Box flexDirection="column">
        {Line(el, [{ text: '☆ ', dim: true }, { text: truncate(a.title, inner(half) - 2) }])}
        <Text dimColor wrap="truncate-end">{`  ${truncate(a.hint, inner(half) - 2)}`}</Text>
      </Box>,
    ),
    locked.length > 4 ? <Text dimColor>{`  ${L.pet.moreLocked(locked.length - 4)}`}</Text> : null,
    <Box marginTop={1}>
      <Text dimColor wrap="wrap">{L.pet.growsLine(XP.turn, XP.testsGreen, XP.todoDone, XP.focusDone, XP.achievement)}</Text>
    </Box>,
  ])

  const tree = (
    <Box flexDirection="column" marginTop={1}>
      {Grid(el, width, [profile, opened, next])}
      <Box marginTop={1}>
        <Button key="pet-toggle" label={prefs.isPetShown ? L.pet.hide : L.pet.show} hotkey="p" onPress={() => on.togglePet()} />
      </Box>
    </Box>
  )
  return { tree, mood: m, hasCat }
}
