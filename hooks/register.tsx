// tabby: a calm dashboard above the prompt, kept by Tabby the cat.
//
//   band   context (+ forecast) · rate limits (+ pace) · cost · turn · git + PR
//          · tests · Claude's plan · focus · todo; hover a block for details,
//          click its label for its tab
//   pane   /tab, or ≡ in the band: overview, git, tasks, tests, Tabby
//   cmds   /tab  /focus  /todo  /test
//   tool   mcp__tabby__todo, so Claude can read and tick the list
//   config /config → tabby: language, theme, pomodoro, thresholds, sound, ...
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TabId, TabPlanItem, TabTodo } from '../types'
import { createActions } from './actions'
import type { Actions } from './actions'
import type { Host } from './host'
import { duration } from './lib/format'
import { L, setLang, setTheme } from './lib/i18n'
import { frameAt } from './lib/anim'
import { NEW_PET } from './lib/pet'
import type { Mood } from './lib/pet'
import { toCells } from './lib/pixels'
import { bigCat, smallCat } from './lib/sprites'
import { isTestCommand } from './lib/tests'
import type { Handlers } from './snapshot'
import * as S from './state'
import { drawBand } from './ui/band'
import { forSurface } from './ui/parts'
import { drawPane } from './ui/pane'

// The mod's state, held by the host so it survives a reload.
const aUsage = atom({ plugin: 'tabby', key: 'usage' } as const, null)
const aSamples = atom({ plugin: 'tabby', key: 'samples' } as const, [])
const aGit = atom({ plugin: 'tabby', key: 'git' } as const, null)
const aTurns = atom({ plugin: 'tabby', key: 'turns' } as const, S.NO_TURNS)
const aLive = atom({ plugin: 'tabby', key: 'live' } as const, null)
const aTodos = atom({ plugin: 'tabby', key: 'todos' } as const, [])
const aPlan = atom({ plugin: 'tabby', key: 'plan' } as const, [])
const aTests = atom({ plugin: 'tabby', key: 'tests' } as const, S.NO_TESTS)
const aFocus = atom({ plugin: 'tabby', key: 'focus' } as const, null)
const aPet = atom({ plugin: 'tabby', key: 'pet' } as const, NEW_PET)
const aStats = atom({ plugin: 'tabby', key: 'stats' } as const, S.NO_STATS)
const aPrefs = atom({ plugin: 'tabby', key: 'prefs' } as const, S.DEFAULT_PREFS)
const aConfirm = atom({ plugin: 'tabby', key: 'confirm' } as const, null)
const aAlerts = atom({ plugin: 'tabby', key: 'alerts' } as const, [])
const aTick = atom({ plugin: 'tabby', key: 'tick' } as const, 0)

const TOOL = 'mcp__tabby__todo'
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

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
  tabby: 'pet',
  таби: 'pet',
  кот: 'pet',
}

function todoList(list: readonly TabTodo[]): string {
  if (list.length === 0) return 'The list is empty.'
  return list
    .map(t => `${t.done ? '[x]' : '[ ]'} #${t.id} ${t.isHigh === true ? '(important) ' : ''}${t.isGlobal === true ? '(every project) ' : ''}${t.text}`)
    .join('\n')
}

/** What Claude is told beside a prompt, when the focus or the list changed. */
function contextNote(focus: { goal: string } | null, todos: readonly TabTodo[]): string {
  const lines: string[] = []
  if (focus !== null) lines.push(`The user's current focus goal: "${focus.goal}". Keep the work aligned with it.`)
  const open = todos.filter(t => !t.done)
  if (open.length > 0) {
    lines.push(
      `Open items on the user's tabby TODO list (tick one off with ${TOOL} when you finish it): ` +
        open.map(t => `#${t.id} ${t.isHigh === true ? '(important) ' : ''}${t.text}`).join('; '),
    )
  }
  return lines.length === 0 ? '' : `[tabby]\n${lines.join('\n')}`
}

export const register: Register = (on, options) => {
  const opts = S.readOptions(options)
  setLang(opts.language)
  setTheme(opts.theme)

  // Built at session.start from that hook's `$`; every later hook and button
  // reaches the engine through it. A reload builds it again.
  let A: Actions | undefined
  let canImage = false
  // where a pixel cat is drawn now, and the frame it shows
  type CatSite = { requestId: string; key: string; size: 'small' | 'big'; mood: Mood; frame: number }
  let bandCat: CatSite | null = null
  let paneCat: CatSite | null = null
  let animTimer: { cancel: () => void } | undefined
  let startAnim: (() => void) | undefined
  let isWindows = false
  let lastNote = ''
  let lastTickWrite = 0

  const run = (label: string, work: (a: Actions) => Promise<unknown>) => () => {
    const a = A
    if (a !== undefined) a.detach(label, () => work(a))
  }
  const handlers: Handlers = {
    open: tab => run('open', a => a.openPane(tab))(),
    setTab: tab => run('tab', a => a.setTab(tab))(),
    runTests: run('tests', a => a.runTests()),
    askToFix: names => run('fix', a => a.askToFix(names))(),
    refreshGit: run('git', a => a.refreshGit()),
    commit: message => run('commit', a => a.commitAll(message))(),
    stash: run('stash', a => a.stash()),
    addTodo: text => run('todo', a => a.addTodo(text, 'user'))(),
    toggleTodo: id => run('todo', a => a.toggleTodo(id))(),
    clearDone: run('todo', a => a.clearDone()),
    startFocus: goal => run('focus', a => a.startFocus(goal, opts.pomodoroMinutes))(),
    stopFocus: run('focus', a => a.stopFocus()),
    togglePet: run('pet', a => a.togglePet()),
    setLanguage: lang => run('lang', a => a.setLanguage(lang))(),
  }

  // ------------------------------------------------------------ session

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // the limits every session shares, beside the user's Claude Code settings
    const sharedPath = async (): Promise<string | null> => {
      const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
      return home === undefined ? null : `${home}/.claude/tabby-limits.json`
    }
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
      shared: {
        read: async () => {
          const path = await sharedPath()
          return path !== null && (await $.fs.exists(path)) ? $.fs.read(path) : undefined
        },
        write: async text => {
          const path = await sharedPath()
          if (path !== null) await $.fs.write(path, text)
        },
      },
      toast: (text, toastOptions) => $.ui.toast(text, toastOptions),
      log: text => $.ui.log(text, { to: 'debug' }),
      after: (ms, fn) => $.clock.after(ms, fn),
      open: () => $.ui.open({ id: 'tabby', title: 'Tabby' }),
      fill: async text => {
        const box = await $.prompt.read()
        if (box.text.trim() === '') await $.prompt.fill({ text })
        else await $.prompt.fill({ text: `\n${text}`, mode: 'append' })
      },
      saveLanguage: async lang => {
        try {
          return (await $.config.set({ key: 'tabby.language', value: lang })).deny === undefined
        } catch {
          return false
        }
      },
      isWindows: () => isWindows,
      play: async asset => {
        await $.audio.play({ asset })
      },
      state: {
        usage: { get: () => read($, aUsage), set: change => update($, aUsage, change) },
        samples: { get: () => read($, aSamples), set: change => update($, aSamples, change) },
        git: { get: () => read($, aGit), set: change => update($, aGit, change) },
        turns: { get: () => read($, aTurns), set: change => update($, aTurns, change) },
        live: { get: () => read($, aLive), set: change => update($, aLive, change) },
        todos: { get: () => read($, aTodos), set: change => update($, aTodos, change) },
        plan: { get: () => read($, aPlan), set: change => update($, aPlan, change) },
        tests: { get: () => read($, aTests), set: change => update($, aTests, change) },
        focus: { get: () => read($, aFocus), set: change => update($, aFocus, change) },
        pet: { get: () => read($, aPet), set: change => update($, aPet, change) },
        stats: { get: () => read($, aStats), set: change => update($, aStats, change) },
        prefs: { get: () => read($, aPrefs), set: change => update($, aPrefs, change) },
        confirm: { get: () => read($, aConfirm), set: change => update($, aConfirm, change) },
        alerts: { get: () => read($, aAlerts), set: change => update($, aAlerts, change) },
        tick: { get: () => read($, aTick), set: change => update($, aTick, change) },
      },
    }
    const a = createActions(host, opts)
    A = a

    // one step failing must not cost the rest: the timers below matter most
    const step = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work()
      } catch (error) {
        $.ui.log(`tabby ${label}: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
      }
    }
    await step('load', () => Promise.all([a.loadPrefs(), a.loadPet(), a.loadTodos(), a.loadStats()]))
    // a reload (a /config change, an edit) finds the session's state already
    // there: it is no new session for the intro hint to count
    const isReload = (await read($, aTick)) > 0
    if (!isReload) await step('intro', () => a.countSession())
    const bootedAt = await $.clock.now()
    await update($, aTick, () => bootedAt)

    // pictures: kitty and Ghostty draw them, other terminals get the text cat
    await step('terminal', async () => {
      const [kitty, program, term, os] = await Promise.all([
        $.env.get('KITTY_WINDOW_ID'),
        $.env.get('TERM_PROGRAM'),
        $.env.get('TERM'),
        $.env.get('OS'),
      ])
      canImage = kitty !== undefined || /ghostty/i.test(program ?? '') || /kitty|ghostty/i.test(term ?? '')
      isWindows = os === 'Windows_NT'
    })

    const commands = [
      { name: 'tab', description: L.cmd.desc.tab, argumentHint: '[overview|git|tasks|tests|pet|compact|hide-pet]' },
      { name: 'focus', description: L.cmd.desc.focus, argumentHint: '<goal> [min] | stop' },
      { name: 'todo', description: L.cmd.desc.todo, argumentHint: '<task> | done N | rm N' },
      { name: 'test', description: L.cmd.desc.test, argumentHint: '[command]' },
    ]
    for (const c of commands) await step(`/${c.name}`, () => $.command.register({ ...c, immediate: true }))

    await step('tool', () =>
      $.tool.register({
        name: 'todo',
        description:
          "The user's personal mini TODO list, shown in the tabby band above their prompt. " +
          "Use it when the user asks about 'my list' or 'my todo', or to tick an item off right after you finish it. " +
          'Actions: list; add (text, optional important, everywhere); done, undo, remove (id).',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'add', 'done', 'undo', 'remove'] },
            text: { type: 'string', description: 'For add: the item text.' },
            important: { type: 'boolean', description: 'For add: mark the item important.' },
            everywhere: { type: 'boolean', description: 'For add: show the item in every project.' },
            id: { type: 'number', description: 'For done, undo and remove: the item number.' },
          },
          required: ['action'],
        },
      }),
    )

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
    // Tabby's blinks, tail and paws: only the cat's cells are repainted, never
    // the whole site. The timer runs while a pixel cat is on screen, no longer.
    startAnim = () => {
      if (animTimer !== undefined || !opts.animate) return
      animTimer = $.clock.every(125, () => {
        if (bandCat === null && paneCat === null) {
          animTimer?.cancel()
          animTimer = undefined
          return
        }
        a.detach('anim', async () => {
          const now = await $.clock.now()
          for (const site of [bandCat, paneCat]) {
            if (site === null) continue
            const frame = frameAt(site.mood, now, site.size)
            if (frame === site.frame) continue
            site.frame = frame
            const c = toCells(site.size === 'small' ? smallCat(site.mood, frame) : bigCat(site.mood, frame))
            let isGone = false
            try {
              const blit = await $.ui.blit({ requestId: site.requestId, key: site.key, cells: c.cells, columns: c.columns, rows: c.rows })
              isGone = blit.deny !== undefined
            } catch {
              isGone = true
            }
            // not mounted any more: rest until the next draw puts it back
            if (isGone) {
              if (bandCat === site) bandCat = null
              if (paneCat === site) paneCat = null
            }
          }
        })
      })
    }
    startAnim()
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
      await update($, aPlan, () => [])
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
    lastTickWrite = await $.clock.now()
    if (A !== undefined) await A.startTurn()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const a = A
    const name = e.tool.startsWith('mcp__') ? (e.tool.split('__').at(-1) ?? e.tool) : e.tool
    if (a !== undefined) await a.countTool(name, EDIT_TOOLS.includes(String(e.tool)))
    const ran = await next(e)
    if (a !== undefined) {
      if (ran.isError === true) await a.countError()
      if (String(e.tool) === 'Bash' || EDIT_TOOLS.includes(String(e.tool))) a.refreshGitSoon()
    }
    return ran
  })

  // tests Claude runs itself show up in the band too; a push refreshes the PR
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const a = A
    if (a === undefined) return next(e)
    if (/\bgit\s+push\b|\bgh\s+pr\b/.test(e.command)) {
      const ran = await next(e)
      a.refreshGitSoon(true)
      return ran
    }
    if (e.run_in_background === true || !isTestCommand(e.command)) return next(e)
    const isMine = await a.beginTests(e.command, 'claude')
    const ran = await next(e)
    if (!isMine) return ran
    if (ran.deny !== undefined) await a.cancelTests()
    else await a.finishTests({ output: ran.text ?? '', isFailed: ran.isError === true })
    return ran
  })

  // Claude's own plan, mirrored into the band and the Tasks tab
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    const a = A
    // a subagent keeps a plan of its own: only the main loop's is Claude's plan
    if (a !== undefined && e.agentId === undefined && ran.deny === undefined && ran.isError !== true && Array.isArray(e.todos)) {
      const items: TabPlanItem[] = e.todos.map(t => ({ text: t.content, active: t.activeForm, status: t.status }))
      await a.setPlan(items)
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const a = A
    if (e.agentId !== undefined || a === undefined) return next(e)
    const u = e.usage
    await a.finishTurn({
      durationMs: e.durationMs,
      isAborted: e.isAborted,
      tokens:
        u === undefined
          ? 0
          : u.input_tokens + u.output_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    })
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
      const added = await a.addTodo(String(e.text ?? ''), 'claude', { isHigh: e.important === true, isGlobal: e.everywhere === true })
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
    if (a === undefined) return { text: L.cmd.notReady }
    const arg = e.args.trim().toLowerCase()
    if (arg === 'compact' || arg === 'компакт') {
      return { text: (await a.toggleCompact()) ? L.cmd.compactOn : L.cmd.compactOff }
    }
    if (arg === 'hide-pet' || arg === 'show-pet') {
      return { text: (await a.togglePet()) ? L.cmd.petOn : L.cmd.petOff }
    }
    const tab = arg === '' ? undefined : TAB_ALIASES[arg]
    if (arg !== '' && tab === undefined) return { text: L.cmd.tabs }
    return { text: (await a.openPane(tab)) ? L.cmd.opened : L.cmd.waits }
  })

  on('command.run', { command: 'focus' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: L.cmd.notReady }
    const raw = e.args.trim()
    if (raw === '' || raw === 'stop' || raw === 'стоп') {
      const prev = await a.stopFocus()
      if (prev === null) return { text: L.cmd.focusUsage }
      return { text: L.cmd.focusEnded(prev.goal, duration((await $.clock.now()) - prev.startedAt)) }
    }
    const match = /^(.*?)(?:\s+(\d{1,3}))?$/.exec(raw)
    const goal = match?.[1]?.trim() || raw
    const minutes = match?.[2] !== undefined && match[1]?.trim() ? Number(match[2]) : opts.pomodoroMinutes
    const f = await a.startFocus(goal, minutes)
    if (f === null) return { text: L.cmd.focusNeedsGoal }
    return { text: f.minutes > 0 ? L.cmd.focusTimer(f.goal, f.minutes) : L.cmd.focusOpen(f.goal) }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: L.cmd.notReady }
    const raw = e.args.trim()
    if (raw === '') {
      await a.openPane('tasks')
      return { text: todoList(await read($, aTodos)) }
    }
    const op = /^(done|undo|rm|remove|готово)\s+#?(\d+)$/i.exec(raw)
    if (op !== null) {
      const id = Number(op[2])
      const verb = op[1]!.toLowerCase()
      if (verb === 'rm' || verb === 'remove') return { text: (await a.removeTodo(id)) ? L.cmd.removed(id) : L.cmd.noTodo(id) }
      const item = await a.setTodoDone(id, verb !== 'undo')
      return { text: item === null ? L.cmd.noTodo(id) : `${item.done ? '☑' : '☐'} #${id} ${item.text}` }
    }
    const added = await a.addTodo(raw, 'user')
    if (added === null) return { text: L.cmd.emptyTodo }
    return { text: `☐ #${added.id} ${added.isHigh === true ? '! ' : ''}${added.text}${added.isGlobal === true ? ' ◆' : ''}` }
  })

  on('command.run', { command: 'test' }, async ($, e) => {
    const a = A
    if (a === undefined) return { text: L.cmd.notReady }
    const custom = e.args.trim()
    if (custom !== '') await a.setTestCommand(custom)
    const command = await a.testCommand()
    if (command === null) return { text: L.cmd.noTestCmd }
    if ((await read($, aTests)).status === 'running') return { text: L.cmd.testsBusy }
    a.detach('tests', () => a.runTests())
    return { text: L.cmd.testsStart(command) }
  })

  // ------------------------------------------------------------ drawing

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [usage, samples, git, turns, live, todos, plan, tests, focus, pet, stats, prefs, confirm, tick] = await Promise.all([
      read($, aUsage),
      read($, aSamples),
      read($, aGit),
      read($, aTurns),
      read($, aLive),
      read($, aTodos),
      read($, aPlan),
      read($, aTests),
      read($, aFocus),
      read($, aPet),
      read($, aStats),
      read($, aPrefs),
      read($, aConfirm),
      read($, aTick),
    ])
    const now = tick > 0 ? tick : await $.clock.now()
    const snap = {
      ...{ usage, samples, git, turns, live, todos, plan, tests, focus, pet, stats, prefs, confirm, now },
      showCost: opts.showCost,
      autoTests: opts.autoTests,
      pomodoroMinutes: opts.pomodoroMinutes,
      canImage,
      animate: opts.animate,
    }
    const drawn = drawBand(forSurface($.ui.resolve(e), e.surface), snap, e.props, handlers)
    // the animator repaints the pixel cat between draws
    bandCat = drawn.hasCat && opts.animate ? { requestId: e.requestId, key: 'cat', size: 'small', mood: drawn.mood, frame: -1 } : null
    if (bandCat !== null) startAnim?.()
    return drawn.tree
  })

  on('ui.render', { component: 'Pane', requestId: 'tabby' }, async ($, e) => {
    const [usage, samples, git, turns, live, todos, plan, tests, focus, pet, stats, prefs, confirm, tick] = await Promise.all([
      read($, aUsage),
      read($, aSamples),
      read($, aGit),
      read($, aTurns),
      read($, aLive),
      read($, aTodos),
      read($, aPlan),
      read($, aTests),
      read($, aFocus),
      read($, aPet),
      read($, aStats),
      read($, aPrefs),
      read($, aConfirm),
      read($, aTick),
    ])
    const now = tick > 0 ? tick : await $.clock.now()
    const snap = {
      ...{ usage, samples, git, turns, live, todos, plan, tests, focus, pet, stats, prefs, confirm, now },
      showCost: opts.showCost,
      autoTests: opts.autoTests,
      pomodoroMinutes: opts.pomodoroMinutes,
      canImage,
      animate: opts.animate,
    }
    const drawn = drawPane(forSurface($.ui.resolve(e), e.surface), snap, e.props.bodyColumns, e.surface !== 'mobile', handlers)
    paneCat = drawn.hasCat && opts.animate ? { requestId: e.requestId, key: 'bigcat', size: 'big', mood: drawn.mood, frame: -1 } : null
    if (paneCat !== null) startAnim?.()
    return drawn.tree
  })
}
