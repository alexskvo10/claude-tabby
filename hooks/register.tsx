// tabby: a calm dashboard above the prompt, kept by Tabby the cat.
//
//   band   context · rate limits · cost · git · tests · focus · todo
//   pane   /tab, or ≡ in the band: overview, git, tasks, tests, Tabby
//   cmds   /tab  /focus  /todo  /test
//   tool   mcp__tabby__todo, so Claude can read and tick the list
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TabId, TabTodo, TabTurn } from '../types'
import { createActions } from './actions'
import type { Actions } from './actions'
import type { Host } from './host'
import { duration } from './lib/format'
import { NEW_PET, XP } from './lib/pet'
import { isTestCommand } from './lib/tests'
import * as S from './state'
import { drawBand } from './ui/band'
import { drawPane } from './ui/pane'

// The mod's state, held by the host so it survives a reload.
const aUsage = atom({ plugin: 'tabby', key: 'usage' } as const, null)
const aGit = atom({ plugin: 'tabby', key: 'git' } as const, null)
const aTurns = atom({ plugin: 'tabby', key: 'turns' } as const, S.NO_TURNS)
const aLive = atom({ plugin: 'tabby', key: 'live' } as const, null)
const aTodos = atom({ plugin: 'tabby', key: 'todos' } as const, [])
const aTests = atom({ plugin: 'tabby', key: 'tests' } as const, S.NO_TESTS)
const aFocus = atom({ plugin: 'tabby', key: 'focus' } as const, null)
const aPet = atom({ plugin: 'tabby', key: 'pet' } as const, NEW_PET)
const aPrefs = atom({ plugin: 'tabby', key: 'prefs' } as const, S.DEFAULT_PREFS)
const aAlerts = atom({ plugin: 'tabby', key: 'alerts' } as const, [])
const aTick = atom({ plugin: 'tabby', key: 'tick' } as const, 0)

const TOOL = 'mcp__tabby__todo'

const TAB_ALIASES: Record<string, TabId> = {
  overview: 'overview',
  обзор: 'overview',
  git: 'git',
  гит: 'git',
  tasks: 'tasks',
  todo: 'tasks',
  задачи: 'tasks',
  focus: 'tasks',
  фокус: 'tasks',
  tests: 'tests',
  test: 'tests',
  тесты: 'tests',
  pet: 'pet',
  cat: 'pet',
  таби: 'pet',
  кот: 'pet',
}

const NOT_READY = 'Tabby ещё запускается — попробуйте через секунду.'

function todoList(list: readonly TabTodo[]): string {
  if (list.length === 0) return 'The list is empty.'
  return list.map(t => `${t.done ? '[x]' : '[ ]'} #${t.id} ${t.text}`).join('\n')
}

/** What Claude is told beside a prompt, when the focus or the list changed. */
function contextNote(focus: { goal: string } | null, todos: readonly TabTodo[]): string {
  const lines: string[] = []
  if (focus !== null) lines.push(`The user's current focus goal: "${focus.goal}". Keep the work aligned with it.`)
  const open = todos.filter(t => !t.done)
  if (open.length > 0) {
    lines.push(
      `Open items on the user's tabby TODO list (tick one off with ${TOOL} when you finish it): ` +
        open.map(t => `#${t.id} ${t.text}`).join('; '),
    )
  }
  return lines.length === 0 ? '' : `[tabby]\n${lines.join('\n')}`
}

export const register: Register = on => {
  // Built at session.start from that hook's `$`; every later hook and button
  // reaches the engine through it. A reload builds it again.
  let A: Actions | undefined
  let lastNote = ''
  let lastTickWrite = 0

  // ------------------------------------------------------------ session

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const host: Host = {
      now: () => $.clock.now(),
      run: (argv, init) => $.process.run(argv, init),
      usage: () => $.session.usage(),
      root: () => $.session.root(),
      repo: () => $.session.repo(),
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      exists: path => $.fs.exists(path),
      readFile: path => $.fs.read(path),
      toast: (text, options) => $.ui.toast(text, options),
      log: text => $.ui.log(text, { to: 'debug' }),
      after: (ms, fn) => $.clock.after(ms, fn),
      open: () => $.ui.open({ id: S.PANE, title: 'Tabby' }),
      state: {
        usage: { get: () => read($, aUsage), set: change => update($, aUsage, change) },
        git: { get: () => read($, aGit), set: change => update($, aGit, change) },
        turns: { get: () => read($, aTurns), set: change => update($, aTurns, change) },
        live: { get: () => read($, aLive), set: change => update($, aLive, change) },
        todos: { get: () => read($, aTodos), set: change => update($, aTodos, change) },
        tests: { get: () => read($, aTests), set: change => update($, aTests, change) },
        focus: { get: () => read($, aFocus), set: change => update($, aFocus, change) },
        pet: { get: () => read($, aPet), set: change => update($, aPet, change) },
        prefs: { get: () => read($, aPrefs), set: change => update($, aPrefs, change) },
        alerts: { get: () => read($, aAlerts), set: change => update($, aAlerts, change) },
        tick: { get: () => read($, aTick), set: change => update($, aTick, change) },
      },
    }
    const a = createActions(host)
    A = a

    // one step failing must not cost the rest: the timers below matter most
    const step = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work()
      } catch (error) {
        $.ui.log(`tabby ${label}: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
      }
    }
    await step('load', () => Promise.all([a.loadPrefs(), a.loadPet(), a.loadTodos()]))
    const bootedAt = await $.clock.now()
    await update($, aTick, () => bootedAt)

    const commands = [
      { name: 'tab', description: 'Tabby: панель — обзор, git, задачи, тесты, кот', argumentHint: '[вкладка | compact | hide-pet]', immediate: true as const },
      { name: 'focus', description: 'Tabby: режим фокуса с помодоро', argumentHint: '<цель> [минуты] | stop', immediate: true as const },
      { name: 'todo', description: 'Tabby: мини-TODO, которое видит и Claude', argumentHint: '<задача> | done N | rm N', immediate: true as const },
      { name: 'test', description: 'Tabby: запустить тесты проекта', argumentHint: '[команда]', immediate: true as const },
    ]
    for (const c of commands) await step(`/${c.name}`, () => $.command.register(c))

    await step('tool', () => $.tool.register({
      name: 'todo',
      description:
        "The user's personal mini TODO list, shown in the tabby band above their prompt. " +
        "Use it when the user asks about 'my list' or 'my todo', or to tick an item off right after you finish it. " +
        'Actions: list; add (text); done, undo, remove (id).',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'done', 'undo', 'remove'] },
          text: { type: 'string', description: 'For add: the item text.' },
          id: { type: 'number', description: 'For done, undo and remove: the item number.' },
        },
        required: ['action'],
      },
    }))

    // each second while something runs or counts down, half a minute at rest
    $.clock.every(1000, () =>
      a.detach('tick', async () => {
        const now = await $.clock.now()
        const [live, tests, focus] = await Promise.all([read($, aLive), read($, aTests), read($, aFocus)])
        const isCounting = focus !== null && focus.minutes > 0 && !focus.isNotified
        if (live !== null || tests.status === 'running' || isCounting || now - lastTickWrite >= 30_000) {
          lastTickWrite = now
          await update($, aTick, () => now)
        }
        await a.checkFocus(now)
      }),
    )
    $.clock.every(45_000, () => a.detach('git', a.refreshGit))
    $.clock.every(30_000, () => a.detach('usage', a.refreshUsage))

    a.detach('usage', a.refreshUsage)
    a.detach('git', a.refreshGit)
    a.detach('tests', async () => {
      const command = await a.testCommand()
      await update($, aTests, t => (t.status === 'none' || t.command === null ? { ...t, command } : t))
    })
    return started
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, aTurns, () => S.NO_TURNS)
      await update($, aLive, () => null)
      lastNote = ''
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    A?.detach('usage', A.refreshUsage)
    return next(e)
  })

  // ------------------------------------------------------------ turns

  on('turn.start', async ($, e, next) => {
    const startedAt = await $.clock.now()
    await update($, aLive, () => ({ startedAt, tools: 0, errors: 0, lastTool: '' }))
    await update($, aTick, () => startedAt)
    lastTickWrite = startedAt
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const name = e.tool.startsWith('mcp__') ? (e.tool.split('__').at(-1) ?? e.tool) : e.tool
    await update($, aLive, l => (l === null ? l : { ...l, tools: l.tools + 1, lastTool: name }))
    await update($, aTurns, t => ({ ...t, tools: t.tools + 1 }))
    const ran = await next(e)
    if (ran.isError === true) {
      await update($, aLive, l => (l === null ? l : { ...l, errors: l.errors + 1 }))
    }
    if (['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(String(e.tool))) A?.refreshGitSoon()
    return ran
  })

  // tests Claude runs itself show up in the band too
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (A === undefined || e.run_in_background === true || !isTestCommand(e.command)) return next(e)
    const a = A
    const isMine = await a.beginTests(e.command, 'claude')
    const ran = await next(e)
    if (!isMine) return ran
    if (ran.deny !== undefined) await a.cancelTests()
    else await a.finishTests({ output: ran.text ?? '', isFailed: ran.isError === true })
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    const live = await read($, aLive)
    const u = e.usage
    const turn: TabTurn = {
      ms: e.durationMs,
      tools: live?.tools ?? 0,
      errors: live?.errors ?? 0,
      tokens:
        u === undefined
          ? 0
          : u.input_tokens + u.output_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      at: now,
    }
    await update($, aLive, () => null)
    await update($, aTurns, t => ({ ...t, count: t.count + 1, history: [...t.history, turn].slice(-40) }))
    await update($, aTick, () => now)

    if (!e.isAborted && e.durationMs >= 90_000) {
      $.ui.toast(`Готово за ${duration(e.durationMs)} · ${turn.tools} инстр`)
    }

    const a = A
    if (a !== undefined) {
      const pet = await a.updatePet(p => ({
        ...p,
        xp: p.xp + XP.turn,
        totals: { ...p.totals, turns: p.totals.turns + 1, tools: p.totals.tools + turn.tools },
      }))
      await a.unlock('first')
      if (pet.totals.turns >= 50) await a.unlock('chatty')
      if (pet.totals.tools >= 200) await a.unlock('toolsmith')
      if (!e.isAborted && turn.tools >= 10 && turn.errors === 0) await a.unlock('clean')
      if (!e.isAborted && turn.tools >= 1 && turn.ms < 10_000) await a.unlock('lightning')
      const hour = new Date(now).getHours()
      if (hour < 5) await a.unlock('owl')
      const usage = await read($, aUsage)
      if (usage !== null && now - usage.startedAt >= 2 * 3_600_000) await a.unlock('marathon')
      a.refreshGitSoon()
      a.detach('usage', a.refreshUsage)
    }
    return next(e)
  })

  // ------------------------------------------------------------ prompt

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return next(e)
    const [focus, todos] = await Promise.all([read($, aFocus), read($, aTodos)])
    const note = contextNote(focus, todos)
    if (note === lastNote) return next(e)
    lastNote = note
    if (note === '') return next(e)
    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  // ------------------------------------------------------------ the todo tool

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const a = A
    if (a === undefined) return { result: 'The tabby list is not ready yet.' }
    const action = String(e.action ?? 'list')
    const id = Number(e.id)
    const list = async () => todoList(await read($, aTodos))
    if (action === 'add') {
      const added = await a.addTodo(String(e.text ?? ''), 'claude')
      return { result: added === null ? 'Nothing added: the text is empty.' : `Added #${added.id}.\n${await list()}` }
    }
    if (action === 'done' || action === 'undo') {
      const item = Number.isInteger(id) ? await a.setTodoDone(id, action === 'done') : null
      if (item === null) return { result: `No item #${String(e.id)}.\n${await list()}` }
      return { result: `#${id} ${action === 'done' ? 'done' : 'reopened'}.\n${await list()}` }
    }
    if (action === 'remove') {
      const isRemoved = Number.isInteger(id) && (await a.removeTodo(id))
      return { result: `${isRemoved ? `Removed #${id}.` : `No item #${String(e.id)}.`}\n${await list()}` }
    }
    return { result: await list() }
  })

  // ------------------------------------------------------------ commands

  on('command.run', { command: 'tab' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: NOT_READY }
    const arg = e.args.trim().toLowerCase()
    if (arg === 'compact' || arg === 'компакт') {
      const isCompact = await a.toggleCompact()
      return { text: isCompact ? 'Плашка: компактный режим (одна строка).' : 'Плашка: полный режим (две строки).' }
    }
    if (arg === 'hide-pet' || arg === 'show-pet') {
      const isShown = await a.togglePet()
      return { text: isShown ? 'Таби снова в плашке.' : 'Таби спрятался из плашки.' }
    }
    const tab = arg === '' ? undefined : TAB_ALIASES[arg]
    if (arg !== '' && tab === undefined) {
      return { text: 'Вкладки: overview, git, tasks, tests, pet. Ещё: /tab compact, /tab hide-pet.' }
    }
    const isPlaced = await a.openPane(tab)
    return {
      text: isPlaced
        ? 'Панель Tabby открыта: 1–5 — вкладки, Esc — обратно к вводу.'
        : 'Панель откроется, когда хватит ширины терминала.',
    }
  })

  on('command.run', { command: 'focus' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: NOT_READY }
    const raw = e.args.trim()
    if (raw === '' || raw === 'stop' || raw === 'стоп') {
      const prev = await a.stopFocus()
      if (prev === null) return { text: 'Использование: /focus <цель> [минуты], например /focus починить логин 25. 0 минут — без таймера.' }
      return { text: `Фокус «${prev.goal}» завершён: ${duration((await $.clock.now()) - prev.startedAt)}.` }
    }
    const match = /^(.*?)(?:\s+(\d{1,3}))?$/.exec(raw)
    const goal = match?.[1]?.trim() || raw
    const minutes = match?.[2] !== undefined && match[1]?.trim() ? Number(match[2]) : 25
    const f = await a.startFocus(goal, minutes)
    if (f === null) return { text: 'Нужна цель: /focus <цель> [минуты]' }
    return { text: f.minutes > 0 ? `◎ Фокус: «${f.goal}» · ${f.minutes} мин.` : `◎ Фокус: «${f.goal}», без таймера.` }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: NOT_READY }
    const raw = e.args.trim()
    if (raw === '') {
      await a.openPane('tasks')
      return { text: todoList(await read($, aTodos)) }
    }
    const op = /^(done|undo|rm|remove|готово)\s+#?(\d+)$/i.exec(raw)
    if (op !== null) {
      const id = Number(op[2])
      const verb = op[1]!.toLowerCase()
      if (verb === 'rm' || verb === 'remove') {
        return { text: (await a.removeTodo(id)) ? `Задача #${id} удалена.` : `Нет задачи #${id}.` }
      }
      const item = await a.setTodoDone(id, verb !== 'undo')
      return { text: item === null ? `Нет задачи #${id}.` : `${item.done ? '☑' : '☐'} #${id} ${item.text}` }
    }
    const added = await a.addTodo(raw, 'user')
    return { text: added === null ? 'Пустая задача не добавлена.' : `☐ #${added.id} ${added.text}` }
  })

  on('command.run', { command: 'test' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: NOT_READY }
    const custom = e.args.trim()
    if (custom !== '') await a.setTestCommand(custom)
    const command = await a.testCommand()
    if (command === null) return { text: 'Не нашёл, как запускать тесты. Задайте команду: /test <команда>' }
    if ((await read($, aTests)).status === 'running') return { text: 'Тесты уже идут — статус в плашке.' }
    a.detach('tests', a.runTests)
    return { text: `Запускаю: ${command} — результат появится в плашке.` }
  })

  // ------------------------------------------------------------ drawing

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [usage, git, turns, live, todos, tests, focus, pet, prefs, tick] = await Promise.all([
      read($, aUsage),
      read($, aGit),
      read($, aTurns),
      read($, aLive),
      read($, aTodos),
      read($, aTests),
      read($, aFocus),
      read($, aPet),
      read($, aPrefs),
      read($, aTick),
    ])
    const now = tick > 0 ? tick : await $.clock.now()
    const snap = { usage, git, turns, live, todos, tests, focus, pet, prefs, now }
    return drawBand($.ui.resolve(e), snap, e.props, () => A?.detach('open', () => A!.openPane()))
  })

  on('ui.render', { component: 'Pane', requestId: 'tabby' }, async ($, e) => {
    const [usage, git, turns, live, todos, tests, focus, pet, prefs, tick] = await Promise.all([
      read($, aUsage),
      read($, aGit),
      read($, aTurns),
      read($, aLive),
      read($, aTodos),
      read($, aTests),
      read($, aFocus),
      read($, aPet),
      read($, aPrefs),
      read($, aTick),
    ])
    const now = tick > 0 ? tick : await $.clock.now()
    const snap = { usage, git, turns, live, todos, tests, focus, pet, prefs, now }
    return drawPane($.ui.resolve(e), snap, e.props.bodyColumns, e.surface !== 'mobile', A)
  })
}
