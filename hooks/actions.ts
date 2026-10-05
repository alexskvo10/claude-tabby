// Everything that changes the mod's state. Hooks and button handlers call
// these; render hooks only read. Each call to the engine goes through `h`.
import type { Timer } from 'claude-code'

import type { TabFocus, TabGit, TabId, TabPet, TabTests, TabTodo, TabUsage } from '../types'
import type { Host } from './host'
import { duration, limitLabel } from './lib/format'
import { parseLog, parseStatus, repoName } from './lib/git'
import { achievement, level, NEW_PET, XP } from './lib/pet'
import { detectCommand, parseSummary, tail } from './lib/tests'

const TEST_TIMEOUT = 10 * 60_000

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export type Actions = ReturnType<typeof createActions>

export function createActions(h: Host) {
  let rootCache: string | undefined
  let repoCache: { name: string | null } | undefined
  let gitBusy = false
  let gitQueued = false
  let gitTimer: Timer | undefined

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

  // -------------------------------------------------------------- pet

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

  async function updatePet(fn: (p: TabPet) => TabPet): Promise<TabPet> {
    const before = await h.state.pet.get()
    const after = await h.state.pet.set(fn)
    await h.storeSet('pet', after)
    const was = level(before.xp).level
    const now = level(after.xp).level
    if (now > was) h.toast(`(=^▽^=)ﾉ ${after.name} достиг уровня ${now}!`, { timeoutMs: 6000 })
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
    h.toast(`★ Достижение «${a.title}» — ${a.hint.toLowerCase()}`, { timeoutMs: 6000 })
  }

  // -------------------------------------------------------------- usage

  async function checkAlerts(u: TabUsage): Promise<void> {
    const fired = await h.state.alerts.get()
    const add: string[] = []
    const ctx = u.percent ?? 0
    // after a /compact the context warnings may come again
    const keep = ctx < 70 ? fired.filter(a => !a.startsWith('ctx:')) : fired

    if (ctx >= 90 && !keep.includes('ctx:90')) {
      add.push('ctx:90', 'ctx:80')
      h.toast('Контекст заполнен на 90% — самое время для /compact', { timeoutMs: 8000 })
      await unlock('deep')
    } else if (ctx >= 80 && !keep.includes('ctx:80')) {
      add.push('ctx:80')
      h.toast('Контекст заполнен на 80% — скоро понадобится /compact', { timeoutMs: 6000 })
    }

    const now = await h.now()
    for (const l of u.limits) {
      const key = `${l.kind}:${l.resetsAt ?? ''}`
      const left = l.resetsAt ? Date.parse(l.resetsAt) - now : NaN
      const resets = Number.isNaN(left) ? '' : ` · сброс через ${duration(left)}`
      if (l.percent >= 95 && !keep.includes(`${key}:95`)) {
        add.push(`${key}:95`, `${key}:80`)
        h.toast(`Лимит ${limitLabel(l.kind)} почти исчерпан: ${Math.round(l.percent)}%${resets}`, { timeoutMs: 8000 })
      } else if (l.percent >= 80 && !keep.includes(`${key}:80`)) {
        add.push(`${key}:80`)
        h.toast(`Лимит ${limitLabel(l.kind)} израсходован на ${Math.round(l.percent)}%${resets}`, { timeoutMs: 6000 })
      }
    }

    if (add.length > 0 || keep.length !== fired.length) {
      await h.state.alerts.set(() => [...keep, ...add].slice(-50))
    }
  }

  async function refreshUsage(): Promise<void> {
    const u = await h.usage()
    const next: TabUsage = {
      tokens: u.context.tokens,
      window: u.context.window,
      percent: u.context.percent,
      limits: u.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
      costUsd: u.cost?.usd,
      startedAt: u.startedAt,
    }
    const prev = await h.state.usage.get()
    if (!same(prev, next)) await h.state.usage.set(() => next)
    await checkAlerts(next)
  }

  // -------------------------------------------------------------- git

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
    const log = await h.run(['git', 'log', '-5', '--pretty=format:%h%x1f%ct%x1f%s'], { cwd, timeoutMs: 15_000 })
    if (repoCache === undefined) {
      const repo = await h.repo()
      repoCache = { name: repo?.name ?? repoName(repo?.remote) }
    }
    const prev = await h.state.git.get()
    const body = {
      ...parseStatus(status.stdout),
      repo: repoCache.name,
      commits: log.exitCode === 0 ? parseLog(log.stdout) : [],
    }
    if (prev !== null && same({ ...prev, at: 0 }, { ...body, at: 0 })) return
    const next: TabGit = { ...body, at: await h.now() }
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
  function refreshGitSoon(): void {
    gitTimer?.cancel()
    gitTimer = h.after(1200, () => detach('git', refreshGit))
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
  async function beginTests(command: string, by: 'button' | 'claude'): Promise<boolean> {
    const prev = await h.state.tests.get()
    if (prev.status === 'running') return false
    const startedAt = await h.now()
    const next: TabTests = { ...prev, status: 'running', command, startedAt, by, previous: prev.status }
    await h.state.tests.set(() => next)
    await h.state.tick.set(() => startedAt)
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
    const next: TabTests = {
      ...prev,
      status: isFailed ? 'fail' : 'pass',
      passed: summary.passed,
      failed: summary.failed,
      total: summary.total,
      ms: now - (prev.startedAt ?? now),
      at: now,
      tail: tail(run.output, 40),
    }
    await h.state.tests.set(() => next)
    await h.state.tick.set(() => now)

    if (!isFailed) {
      if (prev.previous !== 'pass') await gainXp(XP.testsGreen)
      await unlock('green')
      if (prev.previous === 'fail') {
        await unlock('comeback')
        h.toast('Тесты снова зелёные ✓  Таби доволен (=^▽^=)')
      } else if (prev.by === 'button') {
        h.toast(`✓ Тесты прошли${summary.total !== undefined ? `: ${summary.total}` : ''}`)
      }
    } else if (prev.by === 'button') {
      h.toast(
        summary.failed !== undefined && summary.failed > 0
          ? `✗ Упало тестов: ${summary.failed}`
          : '✗ Тесты не прошли — подробности на вкладке «Тесты»',
        { timeoutMs: 6000 },
      )
    }
  }

  /** Runs the project's tests on the host. */
  async function runTests(): Promise<void> {
    const command = await testCommand()
    if (command === null) {
      await h.state.tests.set(t => ({ ...t, command: null }))
      h.toast('Не нашёл команду тестов. Задайте её: /test <команда>', { timeoutMs: 6000 })
      return
    }
    if (!(await beginTests(command, 'button'))) {
      h.toast('Тесты уже идут…')
      return
    }
    let output = ''
    let isFailed = true
    try {
      const ran = await h.run(['sh', '-c', command], {
        cwd: await projectRoot(),
        timeoutMs: TEST_TIMEOUT,
        env: { CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
      })
      output = `${ran.stdout}\n${ran.stderr}`
      isFailed = ran.exitCode !== 0
    } catch (error) {
      output = `Не удалось выполнить «${command}»: ${error instanceof Error ? error.message : String(error)}`
    }
    await finishTests({ output, isFailed })
  }

  // -------------------------------------------------------------- todos

  async function saveTodos(list: TabTodo[]): Promise<void> {
    await h.storeSet(`todos:${await projectRoot()}`, list)
  }

  async function loadTodos(): Promise<void> {
    const stored = await h.storeGet(`todos:${await projectRoot()}`)
    const list = Array.isArray(stored) ? (stored as TabTodo[]) : []
    await h.state.todos.set(() => list)
  }

  async function addTodo(text: string, by: 'user' | 'claude'): Promise<TabTodo | null> {
    const clean = text.trim().replace(/\s+/g, ' ').slice(0, 200)
    if (clean === '') return null
    const list = await h.state.todos.set(l => {
      const id = l.reduce((max, t) => Math.max(max, t.id), 0) + 1
      return [...l, { id, text: clean, done: false, by }]
    })
    await saveTodos(list)
    return list.at(-1) ?? null
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

  // -------------------------------------------------------------- focus

  async function startFocus(goal: string, minutes: number): Promise<TabFocus | null> {
    const clean = goal.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (clean === '') return null
    const next: TabFocus = {
      goal: clean,
      startedAt: await h.now(),
      minutes: Math.max(0, Math.min(180, Math.round(minutes))),
      isNotified: false,
    }
    await h.state.focus.set(() => next)
    return next
  }

  async function stopFocus(): Promise<TabFocus | null> {
    const prev = await h.state.focus.get()
    if (prev !== null) await h.state.focus.set(() => null)
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
      h.toast(`◎ ${f.minutes} мин фокуса позади — сделайте перерыв. Таби гордится вами`, { timeoutMs: 10_000 })
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

  async function openPane(tab?: TabId): Promise<boolean> {
    if (tab !== undefined) await setTab(tab)
    return (await h.open()).isPlaced
  }

  return {
    detach,
    projectRoot,
    loadPet,
    updatePet,
    gainXp,
    unlock,
    refreshUsage,
    refreshGit,
    refreshGitSoon,
    testCommand,
    setTestCommand,
    beginTests,
    cancelTests,
    finishTests,
    runTests,
    loadTodos,
    addTodo,
    setTodoDone,
    toggleTodo,
    removeTodo,
    clearDone,
    startFocus,
    stopFocus,
    checkFocus,
    loadPrefs,
    setTab,
    toggleCompact,
    togglePet,
    openPane,
  }
}
