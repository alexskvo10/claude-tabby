// The dashboard pane: five tabs, keys 1-5 while it holds the keyboard.
import type { RenderElement } from 'claude-code'

import type { TabId } from '../../types'
import type { Actions } from '../actions'
import {
  ago,
  C,
  compact,
  duration,
  heat,
  limitLabel,
  money,
  percent,
  plural,
  sparkline,
  tokens,
  truncate,
  until,
} from '../lib/format'
import { fileTone } from '../lib/git'
import type { Part } from '../lib/layout'
import { ACHIEVEMENTS, ART, level, mood, MOOD_TEXT, XP } from '../lib/pet'
import type { Snapshot } from '../snapshot'
import { barParts, countdown, Line } from './parts'
import type { El } from './parts'

type Ops = Actions | undefined

const TABS: readonly { id: TabId; label: string; key: string }[] = [
  { id: 'overview', label: 'Обзор', key: '1' },
  { id: 'git', label: 'Git', key: '2' },
  { id: 'tasks', label: 'Задачи', key: '3' },
  { id: 'tests', label: 'Тесты', key: '4' },
  { id: 'pet', label: 'Таби', key: '5' },
]

const TONE: Record<ReturnType<typeof fileTone>, Part> = {
  green: { text: '', color: C.green },
  yellow: { text: '', color: C.yellow },
  red: { text: '', color: C.red },
  blue: { text: '', color: C.blue },
  dim: { text: '', dim: true },
}

function title(el: El, text: string, extra?: string): RenderElement {
  const { Text, Box } = el
  return (
    <Box marginTop={1}>
      <Text bold color={C.accent}>
        {text.toUpperCase()}
      </Text>
      {extra !== undefined ? <Text dimColor>{`  ${extra}`}</Text> : null}
    </Box>
  )
}

/** A press handler; does nothing until the session has started. */
function act(A: Ops, label: string, work: (a: Actions) => Promise<unknown>): () => void {
  return () => A?.detach(label, () => work(A))
}

export function drawPane(el: El, snap: Snapshot, bodyColumns: number, hasInput: boolean, A: Ops): RenderElement {
  const { Box, Button, Text } = el
  const { prefs } = snap
  const width = Math.max(20, bodyColumns)

  const header = (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
      {TABS.map(t => (
        <Button
          key={`tab-${t.id}`}
          label={t.label}
          hotkey={t.key}
          plain
          dimColor={prefs.tab !== t.id}
          onPress={act(A, 'tab', a => a.setTab(t.id))}
        />
      ))}
    </Box>
  )

  let body: RenderElement
  if (prefs.tab === 'git') body = gitTab(el, snap, width, A)
  else if (prefs.tab === 'tasks') body = tasksTab(el, snap, width, hasInput, A)
  else if (prefs.tab === 'tests') body = testsTab(el, snap, width, A)
  else if (prefs.tab === 'pet') body = petTab(el, snap, width, A)
  else body = overviewTab(el, snap, width)

  return (
    <Box flexDirection="column" width={width}>
      {header}
      <Text dimColor>{'─'.repeat(width)}</Text>
      {body}
    </Box>
  )
}

// ---------------------------------------------------------------- overview

function overviewTab(el: El, snap: Snapshot, width: number): RenderElement {
  const { Box, Text } = el
  const { usage, turns, live, now } = snap
  const barWidth = Math.max(8, Math.min(30, width - 22))
  const rows: RenderElement[] = []

  rows.push(title(el, 'Контекст'))
  if (usage === null || usage.percent === undefined) {
    rows.push(
      <Text dimColor>
        {`Окно ${usage !== null ? tokens(usage.window) : '—'} токенов · заполнение появится после первого ответа`}
      </Text>,
    )
  } else {
    const pct = usage.percent
    rows.push(Line(el, [...barParts(pct, barWidth), { text: `  ${percent(pct)}`, color: heat(pct), bold: true }]))
    rows.push(
      Line(el, [
        { text: `${tokens(usage.tokens ?? 0)} из ${tokens(usage.window)} токенов`, dim: true },
        ...(pct >= 85 ? [{ text: '  · пора /compact', color: C.red }] : []),
      ]),
    )
  }

  rows.push(title(el, 'Лимиты'))
  if (usage === null || usage.limits.length === 0) {
    rows.push(<Text dimColor>Нет данных: лимиты подписки приходят с первым ответом модели</Text>)
  } else {
    for (const l of usage.limits) {
      const left = until(l.resetsAt, now)
      rows.push(
        Line(el, [
          { text: `${limitLabel(l.kind).padEnd(3)}`, bold: true },
          ...barParts(l.percent, Math.max(6, barWidth - 4)),
          { text: `  ${percent(l.percent)}`, color: heat(l.percent), bold: l.percent >= 85 },
          ...(left !== undefined ? [{ text: `  ↻ ${duration(left)}`, dim: true }] : []),
        ]),
      )
    }
  }

  rows.push(title(el, 'Сессия'))
  const facts: string[] = []
  if (usage !== null) facts.push(duration(now - usage.startedAt))
  facts.push(`${turns.count} ${plural(turns.count, 'ход', 'хода', 'ходов')}`)
  facts.push(`${turns.tools} инстр`)
  if (usage?.costUsd !== undefined) facts.push(money(usage.costUsd))
  rows.push(<Text>{facts.join(' · ')}</Text>)

  if (live !== null) {
    rows.push(
      Line(el, [
        { text: '● ', color: C.accent },
        { text: `идёт ход ${duration(now - live.startedAt)}`, bold: true },
        { text: ` · ${live.tools} инстр${live.lastTool !== '' ? ` · ${live.lastTool}` : ''}`, dim: true },
      ]),
    )
  }

  const history = turns.history.slice(-Math.max(5, Math.min(30, width - 4)))
  if (history.length > 0) {
    rows.push(title(el, 'Ходы', `последние ${history.length}`))
    rows.push(<Text color={C.accent}>{sparkline(history.map(t => t.ms))}</Text>)
    const total = history.reduce((s, t) => s + t.ms, 0)
    const max = history.reduce((m, t) => Math.max(m, t.ms), 0)
    const toolsAvg = history.reduce((s, t) => s + t.tools, 0) / history.length
    const last = history.at(-1)!
    rows.push(
      <Text dimColor>
        {`среднее ${compact(total / history.length)} · максимум ${compact(max)} · ${toolsAvg.toFixed(1)} инстр/ход`}
      </Text>,
    )
    rows.push(
      <Text dimColor>
        {`последний: ${duration(last.ms)} · ${last.tools} инстр${last.errors > 0 ? ` · ${last.errors} ош` : ''}${last.tokens > 0 ? ` · ${tokens(last.tokens)} ток` : ''}`}
      </Text>,
    )
  }

  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- git

function gitTab(el: El, snap: Snapshot, width: number, A: Ops): RenderElement {
  const { Box, Button, Text } = el
  const { git, now } = snap
  const refresh = <Button key="git-refresh" label="Обновить" hotkey="r" onPress={act(A, 'git', a => a.refreshGit())} />

  if (git === null) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Здесь нет git-репозитория.</Text>
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
  rows.push(
    <Text dimColor>{`${git.repo ?? 'локальный репозиторий'} · обновлено ${ago(git.at, now)}`}</Text>,
  )

  const counts: Part[] = []
  if (git.conflicts > 0) counts.push({ text: `✗ ${git.conflicts} конфл.  `, color: C.red, bold: true })
  if (git.staged > 0) counts.push({ text: `● ${git.staged} в индексе  `, color: C.green })
  if (git.changed > 0) counts.push({ text: `✚ ${git.changed} изменено  `, color: C.yellow })
  if (git.untracked > 0) counts.push({ text: `? ${git.untracked} новых`, dim: true })
  rows.push(title(el, 'Изменения'))
  if (counts.length === 0) {
    rows.push(Line(el, [{ text: '✓ ', color: C.green }, { text: 'рабочее дерево чистое', dim: true }]))
  } else {
    rows.push(Line(el, counts))
    const shown = git.files.slice(0, 12)
    for (const f of shown) {
      rows.push(
        Line(el, [
          { ...TONE[fileTone(f.code)], text: ` ${f.code} ` },
          { text: truncate(f.path, width - 4) },
        ]),
      )
    }
    const more = git.staged + git.changed + git.untracked + git.conflicts - shown.length
    if (more > 0) rows.push(<Text dimColor>{`   … и ещё ${more}`}</Text>)
  }

  if (git.commits.length > 0) {
    rows.push(title(el, 'Коммиты'))
    for (const c of git.commits) {
      const when = compact(now - c.at)
      rows.push(
        Line(el, [
          { text: `${c.hash} `, color: C.yellow },
          { text: truncate(c.subject, Math.max(10, width - c.hash.length - when.length - 3)) },
          { text: ` ${when}`, dim: true },
        ]),
      )
    }
  }

  rows.push(<Box marginTop={1}>{refresh}</Box>)
  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- tasks & focus

function tasksTab(el: El, snap: Snapshot, width: number, hasInput: boolean, A: Ops): RenderElement {
  const { Box, Button, Text } = el
  const { todos, focus, now } = snap
  const Input = 'Input' in el ? el.Input : undefined
  const rows: RenderElement[] = []

  rows.push(title(el, 'Фокус'))
  if (focus !== null) {
    const isDone = focus.minutes > 0 && focus.isNotified
    rows.push(
      Line(el, [
        { text: '◎ ', color: C.accent },
        { text: truncate(focus.goal, width - 4), bold: true },
      ]),
    )
    rows.push(
      Line(el, [
        {
          text: isDone
            ? 'помодоро завершён — перерыв'
            : focus.minutes > 0
              ? `осталось ${countdown(focus, now)} из ${focus.minutes} мин`
              : `в фокусе ${countdown(focus, now)}`,
          color: isDone ? C.green : undefined,
          dim: !isDone,
        },
      ]),
    )
    rows.push(
      <Box marginTop={1}>
        <Button key="focus-stop" label="Завершить" hotkey="s" onPress={act(A, 'focus', a => a.stopFocus())} />
      </Box>,
    )
  } else if (hasInput && Input !== undefined) {
    rows.push(
      <Input
        key="focus-goal"
        value=""
        label="◎ "
        placeholder="На чём фокусируемся? Enter — помодоро 25 мин"
        submitLabel="начать"
        onSubmit={value => act(A, 'focus', a => a.startFocus(value, 25))()}
      />,
    )
  } else {
    rows.push(<Text dimColor>/focus цель [минуты] — начать помодоро</Text>)
  }

  const done = todos.filter(t => t.done).length
  rows.push(title(el, 'Задачи', todos.length > 0 ? `${done}/${todos.length}` : undefined))
  if (hasInput && Input !== undefined) {
    rows.push(
      <Input
        key="todo-new"
        value=""
        label="+ "
        placeholder="Новая задача, Enter — добавить"
        submitLabel="добавить"
        onSubmit={value => act(A, 'todo', a => a.addTodo(value, 'user'))()}
      />,
    )
  }
  if (todos.length === 0) {
    rows.push(<Text dimColor>Пусто. Задачи видит и Claude — и может отмечать их сам.</Text>)
  }
  for (const t of todos) {
    rows.push(
      <Box flexDirection="row" key={`row-${t.id}`}>
        <Button
          key={`todo-${t.id}`}
          label={`${t.done ? '☑' : '☐'} ${truncate(t.text, width - 8)}`}
          plain
          dimColor={t.done}
          onPress={act(A, 'todo', a => a.toggleTodo(t.id))}
        />
        {t.by === 'claude' ? <Text color={C.accent}>{' ✦'}</Text> : null}
      </Box>,
    )
  }
  if (done > 0) {
    rows.push(
      <Box marginTop={1}>
        <Button key="todo-clear" label="Убрать выполненные" hotkey="c" onPress={act(A, 'todo', a => a.clearDone())} />
      </Box>,
    )
  }
  if (todos.some(t => t.by === 'claude')) {
    rows.push(<Text dimColor>✦ — добавил Claude</Text>)
  }

  return <Box flexDirection="column">{rows}</Box>
}

// ---------------------------------------------------------------- tests

function testsTab(el: El, snap: Snapshot, width: number, A: Ops): RenderElement {
  const { Box, Button, Text } = el
  const { tests, now } = snap
  const rows: RenderElement[] = []

  const status: Part[] =
    tests.status === 'running'
      ? [
          { text: '◐ ВЫПОЛНЯЮТСЯ', color: C.yellow, bold: true },
          { text: `  ${duration(now - (tests.startedAt ?? now))}`, dim: true },
        ]
      : tests.status === 'pass'
        ? [{ text: '✓ ПРОШЛИ', color: C.green, bold: true }]
        : tests.status === 'fail'
          ? [{ text: '✗ УПАЛИ', color: C.red, bold: true }]
          : [{ text: 'Ещё не запускались', dim: true }]

  if (tests.status === 'pass' || tests.status === 'fail') {
    const bits: string[] = []
    if (tests.total !== undefined) bits.push(`${tests.passed ?? 0} из ${tests.total}`)
    if (tests.failed !== undefined && tests.failed > 0) bits.push(`${tests.failed} упало`)
    if (tests.ms !== undefined) bits.push(duration(tests.ms))
    if (tests.at !== undefined) bits.push(ago(tests.at, now))
    if (tests.by === 'claude') bits.push('запускал Claude')
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
      <Text dimColor>Команда не найдена — задайте: /test npm test</Text>
    ),
  )

  rows.push(
    <Box marginTop={1} flexDirection="row" columnGap={2}>
      <Button
        key="tests-run"
        label={tests.status === 'running' ? 'Идут…' : 'Запустить'}
        hotkey="t"
        variant="primary"
        onPress={act(A, 'tests', a => a.runTests())}
      />
    </Box>,
  )

  if (tests.tail !== '') {
    rows.push(title(el, 'Вывод', 'последние строки'))
    for (const line of tests.tail.split('\n').slice(-14)) {
      const isBad = /\b(FAIL|FAILED|Error|failed|✗|✕|panicked)\b/.test(line)
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

function petTab(el: El, snap: Snapshot, width: number, A: Ops): RenderElement {
  const { Box, Button, Text } = el
  const { pet, prefs, live, tests, focus, turns, now } = snap
  const m = mood({
    isWorking: live !== null,
    isTestsRed: tests.status === 'fail',
    isFocused: focus !== null,
    idleMs: now - (turns.history.at(-1)?.at ?? now),
    sinceUnlockMs: pet.lastUnlock === null ? Infinity : now - pet.lastUnlockAt,
  })
  const lv = level(pet.xp)
  const art = ART[m]

  const card = (
    <Box flexDirection="row" columnGap={3} marginTop={1}>
      <Box flexDirection="column">
        {art.map(line => (
          <Text color={C.accent}>{line}</Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {Line(el, [
          { text: pet.name, bold: true },
          { text: ` · уровень ${lv.level}`, color: C.accent },
        ])}
        {Line(el, [
          ...barParts((lv.into / lv.span) * 100, Math.max(6, Math.min(16, width - 30))),
          { text: ` ${lv.into}/${lv.span} xp`, dim: true },
        ])}
        <Text dimColor>{MOOD_TEXT[m]}</Text>
      </Box>
    </Box>
  )

  const rows: RenderElement[] = [card]
  rows.push(title(el, 'Достижения', `${pet.achievements.length}/${ACHIEVEMENTS.length}`))
  const nameWidth = Math.max(...ACHIEVEMENTS.map(a => a.title.length)) + 2
  for (const a of ACHIEVEMENTS) {
    const has = pet.achievements.includes(a.id)
    rows.push(
      Line(el, [
        { text: has ? '★ ' : '☆ ', color: has ? C.yellow : undefined, dim: !has },
        { text: a.title.padEnd(nameWidth), bold: has, dim: !has },
        { text: truncate(a.hint, Math.max(10, width - nameWidth - 2)), dim: true },
      ]),
    )
  }

  rows.push(title(el, 'Как растёт'))
  rows.push(
    <Text dimColor>
      {`ход +${XP.turn} · зелёные тесты +${XP.testsGreen} · задача +${XP.todoDone} · помодоро +${XP.focusDone} · достижение +${XP.achievement}`}
    </Text>,
  )
  rows.push(
    <Text dimColor>
      {`всего: ${pet.totals.turns} ${plural(pet.totals.turns, 'ход', 'хода', 'ходов')} · ${pet.totals.tools} инстр · ${pet.totals.todosDone} ${plural(pet.totals.todosDone, 'задача', 'задачи', 'задач')}`}
    </Text>,
  )
  rows.push(
    <Box marginTop={1}>
      <Button
        key="pet-toggle"
        label={prefs.isPetShown ? 'Убрать из плашки' : 'Показать в плашке'}
        hotkey="p"
        onPress={act(A, 'pet', a => a.togglePet())}
      />
    </Box>,
  )
  return <Box flexDirection="column">{rows}</Box>
}
