// Everything that changes the mod's state. Hooks and button handlers call
// these; render hooks only read. Each call to the engine goes through `h`.
import type { Timer } from 'claude-code'

import type {
  TabFocus,
  TabGit,
  TabId,
  TabPet,
  TabPlanItem,
  TabPr,
  TabRateLimit,
  TabTests,
  TabTodo,
  TabTurn,
  TabUsage,
} from '../types'
import type { Host } from './host'
import { duration, limitLabel } from './lib/format'
import { burn, addSample } from './lib/forecast'
import { parseLog, parseStatus, repoName } from './lib/git'
import { L, setLang } from './lib/i18n'
import type { Lang } from './lib/i18n'
import { achievement, level, NEW_PET, XP } from './lib/pet'
import { addToDay, dayKey, streak } from './lib/stats'
import { detectCommand, parseFailures, parseSummary, tail } from './lib/tests'
import type { Options } from './state'

const TEST_TIMEOUT = 10 * 60_000
const PR_EVERY = 2 * 60_000
const CHIME = 'assets/chime.wav'

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.slice(0, 120) ?? ''
}

export type Actions = ReturnType<typeof createActions>

export type TurnEnd = {
  durationMs: number
  isAborted: boolean
  tokens: number
}

export function createActions(h: Host, opts: Options) {
  let rootCache: string | undefined
  let repoCache: { name: string | null } | undefined
  let gitBusy = false
  let gitQueued = false
  let gitTimer: Timer | undefined
  let prAt = 0
  let prCache: TabPr | null = null
  let ghMissing = false

  async function projectRoot(): Promise<string> {
    if (rootCache === undefined) rootCache = await h.root()
    return rootCache
  }

  /** Runs work in the background, logging instead of throwing. */
  function detach(label: string, work: () => Promise<unknown>): void {
    void work().catch((error: unknown) => {
      h.log(`tabby ${label}: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** A toast, unless quiet mode keeps all but the critical ones away. */
  function notify(text: string, options: { ms?: number; isCritical?: boolean } = {}): void {
    if (opts.quiet && options.isCritical !== true) return
    h.toast(text, { timeoutMs: options.ms ?? 5000 })
  }

  function chime(): void {
    if (opts.sound) detach('sound', () => h.play(CHIME))
  }

  // -------------------------------------------------------------- pet & stats

  async function loadPet(): Promise<void> {
    const stored = await h.storeGet('pet')
    const raw = stored !== null && typeof stored === 'object' ? (stored as Partial<TabPet>) : {}
    const pet: TabPet = {
      ...NEW_PET,
      ...raw,
      achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
      totals: { ...NEW_PET.totals, ...(raw.totals ?? {}) },
    }
    await h.state.pet.set(() => pet)
  }

  async function loadStats(): Promise<void> {
    const stored = await h.storeGet('stats')
    const days = stored !== null && typeof stored === 'object' ? (stored as { days?: unknown }).days : undefined
    if (days !== null && typeof days === 'object') await h.state.stats.set(() => ({ days: days as Record<string, never> }))
  }

  async function addStats(add: Parameters<typeof addToDay>[2]): Promise<void> {
    const now = await h.now()
    const stats = await h.state.stats.set(s => addToDay(s, now, add))
    await h.storeSet('stats', stats)
  }

  async function updatePet(fn: (p: TabPet) => TabPet): Promise<TabPet> {
    const before = await h.state.pet.get()
    const after = await h.state.pet.set(fn)
    await h.storeSet('pet', after)
    const was = level(before.xp).level
    const now = level(after.xp).level
    if (now > was) notify(L.toast.levelUp(L.tabs.pet, now), { ms: 6000 })
    return after
  }

  async function gainXp(xp: number): Promise<void> {
    await updatePet(p => ({ ...p, xp: p.xp + xp }))
  }

  async function unlock(id: string): Promise<void> {
    const a = achievement(id)
    if (a === undefined) return
    if ((await h.state.pet.get()).achievements.includes(id)) return
    const at = await h.now()
    await updatePet(p =>
      p.achievements.includes(id)
        ? p
        : { ...p, xp: p.xp + XP.achievement, achievements: [...p.achievements, id], lastUnlock: id, lastUnlockAt: at },
    )
    notify(L.toast.achievement(a.title, a.hint), { ms: 6000 })
  }

  // -------------------------------------------------------------- usage

  /** Records that an alert fired; false when it already had. */
  async function mark(key: string): Promise<boolean> {
    if ((await h.state.alerts.get()).includes(key)) return false
    await h.state.alerts.set(a => (a.includes(key) ? a : [...a, key].slice(-60)))
    return true
  }

  async function alertOnce(key: string, text: string, ms: number): Promise<boolean> {
    if (!(await mark(key))) return false
    notify(text, { ms, isCritical: true })
    return true
  }

  async function checkAlerts(u: TabUsage): Promise<void> {
    const ctx = u.percent ?? 0
    // after a /compact the context warnings may come again
    if (ctx < opts.warnContext - 10) {
      const fired = await h.state.alerts.get()
      if (fired.some(a => a.startsWith('ctx:'))) await h.state.alerts.set(a => a.filter(x => !x.startsWith('ctx:')))
    }
    const high = Math.max(opts.warnContext + 1, 90)
    if (ctx >= high) {
      if (await alertOnce(`ctx:${high}`, L.toast.ctxHigh, 8000)) await mark(`ctx:${opts.warnContext}`)
      await unlock('deep')
    } else if (ctx >= opts.warnContext) {
      await alertOnce(`ctx:${opts.warnContext}`, L.toast.ctxWarn(Math.round(ctx)), 6000)
    }

    const now = await h.now()
    const samples = await h.state.samples.get()
    for (const l of u.limits) {
      const key = `${l.kind}:${l.resetsAt ?? ''}`
      const left = l.resetsAt ? Date.parse(l.resetsAt) - now : NaN
      const resets = Number.isNaN(left) ? '' : L.toast.resetsIn(duration(left))
      const label = limitLabel(l.kind)
      if (l.percent >= 95) {
        if (await alertOnce(`${key}:95`, L.toast.limitHigh(label, Math.round(l.percent), resets), 8000)) await mark(`${key}:warn`)
      } else if (l.percent >= opts.warnLimit) {
        await alertOnce(`${key}:warn`, L.toast.limitWarn(label, Math.round(l.percent), resets), 6000)
      } else {
        const b = burn(samples, l.kind, now, Number.isNaN(left) ? undefined : left)
        if (b?.runsOutInMs !== undefined && l.percent >= 25) {
          await alertOnce(`${key}:pace`, L.toast.limitPace(label, duration(b.runsOutInMs)), 8000)
        }
      }
    }
  }

  // A session hears of the account's limits only with its own replies, so an
  // idle one goes stale. Each keeps when its own last moved, and the freshest
  // any session has seen is shared through one file.
  let seenLimits: string | undefined
  let limitsAt = 0

  async function freshestLimits(own: TabRateLimit[], now: number, isFresh: boolean): Promise<TabRateLimit[]> {
    // no limits of its own (an API key, say): another account's are not this session's
    if (own.length === 0) return own
    const key = JSON.stringify(own)
    if (isFresh || (seenLimits !== undefined && key !== seenLimits)) limitsAt = now
    seenLimits = key
    let shared: { at: number; limits: TabRateLimit[] } | undefined
    try {
      const text = await h.shared.read()
      const parsed = text === undefined ? undefined : (JSON.parse(text) as unknown)
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { at?: unknown }).at === 'number' && Array.isArray((parsed as { limits?: unknown }).limits)) {
        const read = parsed as { at: number; limits: TabRateLimit[] }
        // a reading with a window that has reset since says nothing of the new one
        if (!read.limits.some(l => l.resetsAt !== undefined && Date.parse(l.resetsAt) <= now)) shared = read
      }
    } catch {
      // a file another session is writing reads as nothing this time
    }
    if (shared !== undefined && shared.at > limitsAt) return shared.limits
    if (shared === undefined || limitsAt > shared.at) {
      await h.shared.write(JSON.stringify({ at: limitsAt, limits: own })).catch(() => undefined)
    }
    return own
  }

  /** With `isFresh`, a reply just came: this session's limits are the newest there are. */
  async function refreshUsage(isFresh = false): Promise<TabUsage> {
    const u = await h.usage()
    const now = await h.now()
    const own = u.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt }))
    const next: TabUsage = {
      tokens: u.context.tokens,
      window: u.context.window,
      percent: u.context.percent,
      limits: await freshestLimits(own, now, isFresh),
      costUsd: u.cost?.usd,
      startedAt: u.startedAt,
    }
    const prev = await h.state.usage.get()
    if (!same(prev, next)) await h.state.usage.set(() => next)
    if (next.limits.length > 0) {
      await h.state.samples.set(s =>
        next.limits.reduce((acc, l) => addSample(acc, { at: now, kind: l.kind, percent: l.percent, resetsAt: l.resetsAt }), s),
      )
    }
    await checkAlerts(next)
    return next
  }

  // -------------------------------------------------------------- turns

  async function startTurn(): Promise<void> {
    const startedAt = await h.now()
    const usage = await h.state.usage.get()
    await h.state.live.set(() => ({
      startedAt,
      tools: 0,
      errors: 0,
      edits: 0,
      ranTests: false,
      lastTool: '',
      costAtStart: usage?.costUsd,
    }))
    await h.state.tick.set(() => startedAt)
  }

  async function countTool(name: string, isEdit: boolean): Promise<void> {
    await h.state.live.set(l => (l === null ? l : { ...l, tools: l.tools + 1, lastTool: name, edits: l.edits + (isEdit ? 1 : 0) }))
    await h.state.turns.set(t => ({ ...t, tools: t.tools + 1 }))
  }

  async function countError(): Promise<void> {
    await h.state.live.set(l => (l === null ? l : { ...l, errors: l.errors + 1 }))
  }

  async function finishTurn(end: TurnEnd): Promise<void> {
    const now = await h.now()
    const live = await h.state.live.get()
    let usage: TabUsage | null = null
    try {
      // an aborted turn may have had no reply: its figures are not news
      usage = await refreshUsage(!end.isAborted)
    } catch {
      usage = await h.state.usage.get()
    }
    const cost =
      usage?.costUsd !== undefined && live?.costAtStart !== undefined ? Math.max(0, usage.costUsd - live.costAtStart) : undefined
    const turn: TabTurn = {
      ms: end.durationMs,
      tools: live?.tools ?? 0,
      errors: live?.errors ?? 0,
      tokens: end.tokens,
      context: usage?.tokens,
      costUsd: cost,
      at: now,
    }
    await h.state.live.set(() => null)
    await h.state.turns.set(t => ({ ...t, count: t.count + 1, history: [...t.history, turn].slice(-40) }))
    await h.state.tick.set(() => now)
    await addStats({ turns: 1, tools: turn.tools, costUsd: cost ?? 0 })

    if (!end.isAborted && end.durationMs >= 90_000) {
      notify(L.toast.turnDone(duration(end.durationMs), turn.tools))
      chime()
    }

    const pet = await updatePet(p => ({
      ...p,
      xp: p.xp + XP.turn,
      totals: { ...p.totals, turns: p.totals.turns + 1, tools: p.totals.tools + turn.tools },
    }))
    await unlock('first')
    if (pet.totals.turns >= 50) await unlock('chatty')
    if (pet.totals.tools >= 200) await unlock('toolsmith')
    if (!end.isAborted && turn.tools >= 10 && turn.errors === 0) await unlock('clean')
    if (!end.isAborted && turn.tools >= 1 && turn.ms < 10_000) await unlock('lightning')
    if (new Date(now).getHours() < 5) await unlock('owl')
    if (usage !== null && now - usage.startedAt >= 2 * 3_600_000) await unlock('marathon')
    const days = streak(await h.state.stats.get(), now)
    if (days >= 3) await unlock('streak3')
    if (days >= 7) await unlock('streak7')

    // the plan is done once every step is: it leaves the band
    const plan = await h.state.plan.get()
    if (plan.length > 0 && plan.every(p => p.status === 'completed')) await h.state.plan.set(() => [])

    if (opts.autoTests && !end.isAborted && live !== null && live.edits > 0 && !live.ranTests) {
      detach('tests', () => runTests('auto'))
    }
    refreshGitSoon()
  }

  // -------------------------------------------------------------- git

  async function readPr(cwd: string): Promise<TabPr | null> {
    if (ghMissing) return null
    const now = await h.now()
    if (now - prAt < PR_EVERY) return prCache
    prAt = now
    try {
      const ran = await h.run(['gh', 'pr', 'view', '--json', 'number,title,url,state,isDraft,statusCheckRollup'], {
        cwd,
        timeoutMs: 20_000,
      })
      if (ran.exitCode !== 0) {
        prCache = null
        return null
      }
      const raw = JSON.parse(ran.stdout) as {
        number: number
        title: string
        url: string
        state: string
        isDraft: boolean
        statusCheckRollup?: { status?: string; conclusion?: string; state?: string }[]
      }
      const checks = { passed: 0, failed: 0, pending: 0 }
      for (const c of raw.statusCheckRollup ?? []) {
        const verdict = (c.conclusion || c.state || c.status || '').toUpperCase()
        if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(verdict)) checks.passed += 1
        else if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(verdict)) checks.failed += 1
        else checks.pending += 1
      }
      prCache = { number: raw.number, title: raw.title, url: raw.url, state: raw.state, isDraft: raw.isDraft, checks }
      if (checks.passed > 0 && checks.failed === 0 && checks.pending === 0) await unlock('shipit')
      return prCache
    } catch {
      // gh is not installed, or is not on PATH: stop asking
      ghMissing = true
      prCache = null
      return null
    }
  }

  async function readGit(): Promise<void> {
    const cwd = await projectRoot()
    const status = await h.run(['git', 'status', '--porcelain=v2', '--branch', '--untracked-files=normal'], {
      cwd,
      timeoutMs: 15_000,
      env: { GIT_OPTIONAL_LOCKS: '0' },
    })
    if (status.exitCode !== 0) {
      if ((await h.state.git.get()) !== null) await h.state.git.set(() => null)
      return
    }
    const [log, stashes] = await Promise.all([
      h.run(['git', 'log', '-5', '--pretty=format:%h%x1f%ct%x1f%s'], { cwd, timeoutMs: 15_000 }),
      h.run(['git', 'stash', 'list'], { cwd, timeoutMs: 15_000 }),
    ])
    if (repoCache === undefined) {
      const repo = await h.repo()
      repoCache = { name: repo?.name ?? repoName(repo?.remote) }
    }
    const pr = await readPr(cwd)
    const prev = await h.state.git.get()
    const body = {
      ...parseStatus(status.stdout),
      repo: repoCache.name,
      commits: log.exitCode === 0 ? parseLog(log.stdout) : [],
      stashes: stashes.exitCode === 0 ? stashes.stdout.split('\n').filter(l => l.trim() !== '').length : 0,
      pr,
    }
    const at = await h.now()
    // the time of the check moves the "checked" line only once a minute
    if (prev !== null && same({ ...prev, at: 0 }, { ...body, at: 0 }) && at - prev.at < 60_000) return
    const next: TabGit = { ...body, at }
    await h.state.git.set(() => next)
  }

  async function refreshGit(): Promise<void> {
    if (gitBusy) {
      gitQueued = true
      return
    }
    gitBusy = true
    try {
      do {
        gitQueued = false
        await readGit()
      } while (gitQueued)
    } finally {
      gitBusy = false
    }
  }

  /** Refreshes git a moment after the last call, so a burst of edits reads once. */
  function refreshGitSoon(forcePr = false): void {
    if (forcePr) prAt = 0
    gitTimer?.cancel()
    gitTimer = h.after(1200, () => detach('git', refreshGit))
  }

  async function commitAll(message: string): Promise<void> {
    const msg = message.trim()
    if (msg === '') return
    const cwd = await projectRoot()
    const added = await h.run(['git', 'add', '-A'], { cwd, timeoutMs: 30_000 })
    if (added.exitCode !== 0) {
      notify(L.git.commitFailed(firstLine(added.stderr)), { isCritical: true })
      return
    }
    const ran = await h.run(['git', 'commit', '-m', msg], { cwd, timeoutMs: 60_000 })
    if (ran.exitCode === 0) {
      notify(L.git.committed(msg))
      await unlock('committer')
    } else if (/nothing to commit|nothing added/.test(ran.stdout + ran.stderr)) {
      notify(L.git.nothing)
    } else {
      notify(L.git.commitFailed(firstLine(ran.stderr || ran.stdout)), { isCritical: true, ms: 8000 })
    }
    await refreshGit()
  }

  /** A press that only acts on its second press within five seconds. */
  async function confirmed(key: string): Promise<boolean> {
    const now = await h.now()
    const c = await h.state.confirm.get()
    if (c !== null && c.key === key && now <= c.until) {
      await h.state.confirm.set(() => null)
      return true
    }
    await h.state.confirm.set(() => ({ key, until: now + 5000 }))
    h.after(5200, () => detach('confirm', () => h.state.confirm.set(x => (x !== null && x.key === key && x.until <= now + 5000 ? null : x))))
    return false
  }

  async function stash(): Promise<void> {
    if (!(await confirmed('stash'))) return
    const cwd = await projectRoot()
    const ran = await h.run(['git', 'stash', 'push', '-u', '-m', `tabby ${new Date(await h.now()).toISOString()}`], {
      cwd,
      timeoutMs: 60_000,
    })
    if (ran.exitCode === 0) notify(L.git.stashed)
    else notify(L.git.stashFailed(firstLine(ran.stderr || ran.stdout)), { isCritical: true })
    await refreshGit()
  }

  // -------------------------------------------------------------- tests

  async function testCommand(): Promise<string | null> {
    const root = await projectRoot()
    const custom = await h.storeGet(`testcmd:${root}`)
    if (typeof custom === 'string' && custom.trim() !== '') return custom
    return detectCommand({
      exists: path => h.exists(`${root}/${path}`),
      read: async path => {
        try {
          return (await h.exists(`${root}/${path}`)) ? await h.readFile(`${root}/${path}`) : undefined
        } catch {
          return undefined
        }
      },
    })
  }

  async function setTestCommand(command: string): Promise<void> {
    await h.storeSet(`testcmd:${await projectRoot()}`, command)
    await h.state.tests.set(t => ({ ...t, command }))
  }

  /** Marks a run as started; false when one is already running. */
  async function beginTests(command: string, by: 'button' | 'claude' | 'auto'): Promise<boolean> {
    const prev = await h.state.tests.get()
    if (prev.status === 'running') return false
    const startedAt = await h.now()
    const next: TabTests = { ...prev, status: 'running', command, startedAt, by, previous: prev.status }
    await h.state.tests.set(() => next)
    await h.state.tick.set(() => startedAt)
    if (by === 'claude') await h.state.live.set(l => (l === null ? l : { ...l, ranTests: true }))
    return true
  }

  /** Puts back what stood before a run that never happened (a denied call). */
  async function cancelTests(): Promise<void> {
    await h.state.tests.set(t => (t.status === 'running' ? { ...t, status: t.previous } : t))
  }

  async function finishTests(run: { output: string; isFailed: boolean }): Promise<void> {
    const prev = await h.state.tests.get()
    if (prev.status !== 'running') return
    const now = await h.now()
    const summary = parseSummary(run.output)
    const isFailed = run.isFailed || (summary.failed ?? 0) > 0
    const status: 'pass' | 'fail' = isFailed ? 'fail' : 'pass'
    const next: TabTests = {
      ...prev,
      status,
      passed: summary.passed,
      failed: summary.failed,
      total: summary.total,
      ms: now - (prev.startedAt ?? now),
      at: now,
      tail: tail(run.output, 40),
      failures: isFailed ? parseFailures(run.output) : [],
      history: [...prev.history, { status, at: now, failed: summary.failed }].slice(-24),
    }
    await h.state.tests.set(() => next)
    await h.state.tick.set(() => now)

    const isMine = prev.by === 'button' || prev.by === 'auto'
    if (!isFailed) {
      if (prev.previous !== 'pass') await gainXp(XP.testsGreen)
      await unlock('green')
      if (prev.previous === 'fail') {
        await unlock('comeback')
        notify(L.toast.testsBack)
      } else if (isMine) {
        notify(L.toast.testsPass(summary.total))
      }
    } else if (isMine) {
      notify(L.toast.testsFail(summary.failed), { ms: 6000, isCritical: true })
    }
  }

  /** Runs the project's tests on the host. */
  async function runTests(by: 'button' | 'auto' = 'button'): Promise<void> {
    const command = await testCommand()
    if (command === null) {
      await h.state.tests.set(t => ({ ...t, command: null }))
      if (by === 'button') notify(L.toast.noTestCmd, { ms: 6000, isCritical: true })
      return
    }
    if (!(await beginTests(command, by))) {
      if (by === 'button') notify(L.toast.testsBusy)
      return
    }
    let output = ''
    let isFailed = true
    try {
      const argv = h.isWindows() ? ['cmd.exe', '/d', '/s', '/c', command] : ['sh', '-c', command]
      const ran = await h.run(argv, {
        cwd: await projectRoot(),
        timeoutMs: TEST_TIMEOUT,
        env: { CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
      })
      output = `${ran.stdout}\n${ran.stderr}`
      isFailed = ran.exitCode !== 0
    } catch (error) {
      output = `${command}: ${error instanceof Error ? error.message : String(error)}`
    }
    await finishTests({ output, isFailed })
  }

  /** Puts a request to fix failing tests in the prompt box. */
  async function askToFix(names?: readonly string[]): Promise<void> {
    const t = await h.state.tests.get()
    const list = names ?? t.failures
    const text =
      list.length === 1
        ? L.prompt.fixTest(list[0]!)
        : `${L.prompt.fixTests}${list.length > 0 ? `\n${list.map(n => `- ${n}`).join('\n')}` : ` ${t.command ?? ''}`}`
    await h.fill(text)
  }

  // -------------------------------------------------------------- todos

  function todoKey(isGlobal: boolean, root: string): string {
    return isGlobal ? 'todos:*' : `todos:${root}`
  }

  async function saveTodos(list: TabTodo[]): Promise<void> {
    const root = await projectRoot()
    await h.storeSet(todoKey(false, root), list.filter(t => t.isGlobal !== true))
    await h.storeSet(todoKey(true, root), list.filter(t => t.isGlobal === true))
  }

  async function loadTodos(): Promise<void> {
    const root = await projectRoot()
    const read = async (key: string) => {
      const v = await h.storeGet(key)
      return Array.isArray(v) ? (v as TabTodo[]) : []
    }
    const local = await read(todoKey(false, root))
    const global = (await read(todoKey(true, root))).map(t => ({ ...t, isGlobal: true }))
    await h.state.todos.set(() => [...global, ...local])
  }

  /** Reads "!" (important) and "*" (every project) off the front of a task. */
  function parseTodo(text: string): { text: string; isHigh: boolean; isGlobal: boolean } {
    let rest = text.trim()
    let isHigh = false
    let isGlobal = false
    for (;;) {
      if (rest.startsWith('!')) isHigh = true
      else if (rest.startsWith('*')) isGlobal = true
      else break
      rest = rest.slice(1).trimStart()
    }
    return { text: rest.replace(/\s+/g, ' ').slice(0, 200), isHigh, isGlobal }
  }

  async function addTodo(
    raw: string,
    by: 'user' | 'claude',
    flags: { isHigh?: boolean; isGlobal?: boolean } = {},
  ): Promise<TabTodo | null> {
    const parsed = parseTodo(raw)
    if (parsed.text === '') return null
    const seqStored = await h.storeGet('todo-seq')
    const known = (await h.state.todos.get()).reduce((max, t) => Math.max(max, t.id), 0)
    const id = Math.max(known, typeof seqStored === 'number' ? seqStored : 0) + 1
    await h.storeSet('todo-seq', id)
    const item: TabTodo = {
      id,
      text: parsed.text,
      done: false,
      by,
      ...(parsed.isHigh || flags.isHigh ? { isHigh: true } : {}),
      ...(parsed.isGlobal || flags.isGlobal ? { isGlobal: true } : {}),
    }
    const list = await h.state.todos.set(l => [...l, item])
    await saveTodos(list)
    return item
  }

  async function setTodoDone(id: number, done: boolean): Promise<TabTodo | null> {
    const before = (await h.state.todos.get()).find(t => t.id === id)
    if (before === undefined) return null
    const list = await h.state.todos.set(l => l.map(t => (t.id === id ? { ...t, done } : t)))
    await saveTodos(list)
    if (done && !before.done) {
      const pet = await updatePet(p => ({
        ...p,
        xp: p.xp + XP.todoDone,
        totals: { ...p.totals, todosDone: p.totals.todosDone + 1 },
      }))
      if (pet.totals.todosDone >= 10) await unlock('productive')
    }
    return { ...before, done }
  }

  async function toggleTodo(id: number): Promise<void> {
    const item = (await h.state.todos.get()).find(t => t.id === id)
    if (item !== undefined) await setTodoDone(id, !item.done)
  }

  async function toggleHigh(id: number): Promise<void> {
    const list = await h.state.todos.set(l => l.map(t => (t.id === id ? { ...t, isHigh: t.isHigh !== true } : t)))
    await saveTodos(list)
  }

  async function removeTodo(id: number): Promise<boolean> {
    if (!(await h.state.todos.get()).some(t => t.id === id)) return false
    const list = await h.state.todos.set(l => l.filter(t => t.id !== id))
    await saveTodos(list)
    return true
  }

  async function clearDone(): Promise<void> {
    const list = await h.state.todos.set(l => l.filter(t => !t.done))
    await saveTodos(list)
  }

  async function setPlan(items: readonly TabPlanItem[]): Promise<void> {
    await h.state.plan.set(() => items.slice(0, 30))
  }

  // -------------------------------------------------------------- focus

  async function startFocus(goal: string, minutes: number): Promise<TabFocus | null> {
    const clean = goal.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (clean === '') return null
    await stopFocus()
    const next: TabFocus = {
      goal: clean,
      startedAt: await h.now(),
      minutes: Math.max(0, Math.min(180, Math.round(minutes))),
      isNotified: false,
    }
    await h.state.focus.set(() => next)
    return next
  }

  async function recordFocus(ms: number): Promise<void> {
    if (ms < 60_000) return
    await addStats({ focusMs: ms })
    const now = await h.now()
    if (((await h.state.stats.get()).days[dayKey(now)]?.focusMs ?? 0) >= 2 * 3_600_000) await unlock('deepwork')
  }

  async function stopFocus(): Promise<TabFocus | null> {
    const prev = await h.state.focus.get()
    if (prev === null) return null
    await h.state.focus.set(() => null)
    // a finished pomodoro was counted when it finished
    if (!prev.isNotified) await recordFocus((await h.now()) - prev.startedAt)
    return prev
  }

  /** Called each second: ends a pomodoro, clears one long finished. */
  async function checkFocus(now: number): Promise<void> {
    const f = await h.state.focus.get()
    if (f === null || f.minutes === 0) return
    const elapsed = now - f.startedAt
    const span = f.minutes * 60_000
    if (!f.isNotified && elapsed >= span) {
      await h.state.focus.set(x => (x === null ? x : { ...x, isNotified: true }))
      notify(L.toast.focusDone(f.minutes), { ms: 10_000, isCritical: true })
      chime()
      await recordFocus(span)
      await gainXp(XP.focusDone)
      await unlock('flow')
    } else if (f.isNotified && elapsed >= span + 10 * 60_000) {
      await h.state.focus.set(() => null)
    }
  }

  // -------------------------------------------------------------- prefs, pane

  async function loadPrefs(): Promise<void> {
    const stored = await h.storeGet('prefs')
    if (stored !== null && typeof stored === 'object') {
      await h.state.prefs.set(p => ({ ...p, ...(stored as object) }))
    }
  }

  async function savePrefs(): Promise<void> {
    await h.storeSet('prefs', await h.state.prefs.get())
  }

  /** Counts a session toward the intro hint, which shows in the first three. */
  async function countSession(): Promise<void> {
    await h.state.prefs.set(p => ({ ...p, introSeen: p.introSeen + 1 }))
    await savePrefs()
  }

  async function setTab(tab: TabId): Promise<void> {
    await h.state.prefs.set(p => ({ ...p, tab }))
    await savePrefs()
  }

  async function toggleCompact(): Promise<boolean> {
    const p = await h.state.prefs.set(x => ({ ...x, isCompact: !x.isCompact }))
    await savePrefs()
    return p.isCompact
  }

  async function togglePet(): Promise<boolean> {
    const p = await h.state.prefs.set(x => ({ ...x, isPetShown: !x.isPetShown }))
    await savePrefs()
    return p.isPetShown
  }

  /** Speaks `lang` at once, and keeps it in /config for the next sessions. */
  async function setLanguage(lang: Lang): Promise<void> {
    setLang(lang)
    // the words are not state: a new tick draws everything again
    const now = await h.now()
    await h.state.tick.set(() => now)
    if (!(await h.saveLanguage(lang))) h.toast(L.cmd.langUnsaved)
  }

  async function openPane(tab?: TabId): Promise<boolean> {
    if (tab !== undefined) await setTab(tab)
    // opening the pane is the intro done
    await h.state.prefs.set(p => (p.introSeen >= 3 ? p : { ...p, introSeen: 3 }))
    await savePrefs()
    return (await h.open()).isPlaced
  }

  return {
    opts,
    detach,
    projectRoot,
    loadPet,
    loadStats,
    updatePet,
    gainXp,
    unlock,
    refreshUsage,
    startTurn,
    countTool,
    countError,
    finishTurn,
    refreshGit,
    refreshGitSoon,
    commitAll,
    stash,
    testCommand,
    setTestCommand,
    beginTests,
    cancelTests,
    finishTests,
    runTests,
    askToFix,
    loadTodos,
    addTodo,
    setTodoDone,
    toggleTodo,
    toggleHigh,
    removeTodo,
    clearDone,
    setPlan,
    startFocus,
    stopFocus,
    checkFocus,
    loadPrefs,
    countSession,
    setTab,
    toggleCompact,
    togglePet,
    setLanguage,
    openPane,
  }
}
