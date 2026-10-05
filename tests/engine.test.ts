import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { lines } from './text'

const STATUS = [
  '# branch.oid 0123456789abcdef',
  '# branch.head feature/band',
  '# branch.upstream origin/feature/band',
  '# branch.ab +1 -0',
  '1 .M N... 100644 100644 100644 aaa bbb hooks/register.tsx',
  '? notes.md',
].join('\n')

const LOG = 'd7cb9a4\x1f1759600000\x1fInitial commit'
const NOW = Date.parse('2026-10-05T12:00:00Z')
const RED = 'Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 40 passed (42)'
const GREEN = '      Tests  42 passed (42)'

type Usage = { percent: number; fiveHour: number }

type World = {
  toasts: string[]
  opened: string[]
  ran: string[][]
  tests: { exitCode: number; stdout: string }
  usage: Usage
  context: string[][]
  store: Map<string, unknown>
  clock: ReturnType<typeof mock.clock>
}

function done(exitCode: number, stdout: string) {
  return { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
}

/** Everything beneath the plugin: a repo, a session with usage, a host. */
function world(on: On, files: Record<string, string> = { '/repo/package.json': '{"scripts":{"test":"vitest run"}}' }): World {
  const clock = mock.clock(on, { now: NOW })
  const w: World = {
    toasts: [],
    opened: [],
    ran: [],
    tests: { exitCode: 1, stdout: RED },
    usage: { percent: 48, fiveHour: 23 },
    context: [],
    store: new Map(),
    clock,
  }
  on('store.get', ($, e) => ({ value: w.store.get(e.key) }))
  on('store.set', ($, e) => {
    w.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/repo' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.repo', () => ({
    value: { root: '/repo', remote: 'git@github.com:alexskvo10/claude-tab.git', internal: false, name: null },
  }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 72 * 60_000,
      context: { tokens: w.usage.percent * 2000, window: 200_000, percent: w.usage.percent },
      rateLimits: [
        { kind: 'five_hour', percentUsed: w.usage.fiveHour, resetsAt: '2026-10-05T14:14:00Z' },
        { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-08T16:00:00Z' },
      ],
      cost: { usd: 1.24 },
    },
  }))
  on('process.run', ($, e) => {
    w.ran.push([...e.argv])
    if (e.argv[0] === 'git' && e.argv[1] === 'status') return { value: done(0, STATUS) }
    if (e.argv[0] === 'git' && e.argv[1] === 'log') return { value: done(0, LOG) }
    if (e.argv[0] === 'sh') return { value: done(w.tests.exitCode, w.tests.stdout) }
    return { value: done(1, '') }
  })
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__tabby__${e.name}` } }))
  on('ui.toast', ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', ($, e) => {
    w.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => {
    w.context.push([...(e.context ?? [])])
    return { text: e.text, context: e.context }
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash' && /test/.test(String(e.command))) {
      return w.tests.exitCode === 0
        ? { result: { stdout: w.tests.stdout }, text: w.tests.stdout }
        : { isError: true as const, result: w.tests.stdout, text: w.tests.stdout }
    }
    return { result: 'ok', text: 'ok' }
  })
  return w
}

async function boot($: Engine, w: World): Promise<void> {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
}

const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: true, columns: 140 } as never

async function command($: Engine, w: World, name: string, args = ''): Promise<string> {
  const ran = await $.command.run({ command: name, args, origin: ORIGIN, presentation: PRESENTATION })
  await w.clock.settle()
  return ran.text ?? ''
}

async function turn($: Engine, w: World, ms: number, tools: number): Promise<void> {
  await $.turn.start({ text: 'go', turnId: `t${ms}` })
  for (let i = 0; i < tools; i += 1) await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' } as never)
  await w.clock.advance(ms)
  await $.turn.complete({
    answer: 'done',
    durationMs: ms,
    isAborted: false,
    turnId: `t${ms}`,
    reason: 'answer',
    usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0, model: 'm' },
  } as never)
  await w.clock.settle()
}

const BAND = (bodyColumns: number, isWorking = false) => ({
  plugin: 'tabby',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 9 }, view: {} },
})

async function band($: Engine, cols: number, surface: 'terminal' | 'desktop' = 'terminal'): Promise<string[]> {
  const ui = await $.ui.mount({ surface, ...BAND(cols) })
  const drawn = lines((await ui.drawn()) as never)
  await ui.unmount()
  return drawn
}

const PANE = (bodyColumns: number) => ({
  plugin: 'tabby',
  component: 'Pane' as const,
  requestId: 'tabby',
  props: { title: 'Tabby', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never,
})

describe('band', () => {
  test('draws the session row and the work row on both surfaces', async ($, on) => {
    const w = world(on)
    await boot($, w)
    for (const surface of ['terminal', 'desktop'] as const) {
      const [session, work] = await band($, 140, surface)
      expect(session).toMatch(/\(=\^･ω･\^=\)\s+ctx ▰+▱+ 48%\s+96k\/200k\s+5ч ▰+▱+ 23%\s+↻2ч14м\s+7д ▰+▱+ 41%\s+↻3д4ч\s+\$1\.24/)
      expect(session).toEndWith('≡')
      expect(work).toBe('⎇ feature/band ↑1 ✚2')
    }
  })

  test('never draws wider than its box, and keeps the essentials when narrow', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'todo', 'Очень длинная задача, которая точно не поместится в узкую плашку')
    await command($, w, 'focus', 'Длинная цель фокуса для проверки обрезки 25')
    await turn($, w, 34_000, 3)
    for (const cols of [30, 40, 50, 64, 80, 96, 120, 160, 220]) {
      const drawn = await band($, cols)
      for (const line of drawn) expect(Array.from(line).length, `${cols}: ${line}`).toBeLessThanOrEqual(cols)
      expect(drawn[0], `${cols}`).toMatch(/ctx/)
      if (cols >= 50) expect(drawn[1], `${cols}`).toMatch(/feature\/band/)
    }
  })

  test('shows a live turn with its clock and tool count', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await $.turn.start({ text: 'go', turnId: 'live' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' } as never)
    await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
    await w.clock.advance(12_000)
    const [session, work] = await band($, 140)
    expect(session).toMatch(/^\(=•ω•=\)/)
    expect(work).toMatch(/^[●◉○] 12с · 2 инстр/)
  })

  test('compact mode is one row, and the cat can be hidden', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'tab', 'compact')).toMatch(/компактный/)
    const drawn = await band($, 120)
    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toMatch(/ctx .* 48%.*5ч 23%.*⎇ feature\/band/)
    await command($, w, 'tab', 'hide-pet')
    expect((await band($, 120))[0]).toStartWith('ctx')
  })

  test('the ≡ button opens the pane', async ($, on) => {
    const w = world(on)
    await boot($, w)
    const ui = await $.ui.mount({ surface: 'terminal', ...BAND(120) })
    await ui.press({ key: 'open' })
    await w.clock.settle()
    expect(w.opened).toEqual(['tabby'])
    await ui.unmount()
  })
})

describe('usage alerts', () => {
  test('warn once as context and limits fill up', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(w.toasts).toEqual([])
    w.usage = { percent: 91, fiveHour: 82 }
    await w.clock.advance(30_000)
    expect(w.toasts.some(t => /Контекст заполнен на 90%/.test(t))).toBe(true)
    expect(w.toasts.some(t => /Лимит 5ч израсходован на 82%/.test(t))).toBe(true)
    expect(w.toasts.some(t => /Бездонная память/.test(t))).toBe(true)
    const count = w.toasts.length
    await w.clock.advance(30_000)
    await w.clock.advance(30_000)
    expect(w.toasts.length).toBe(count)
    expect((await band($, 140))[0]).toMatch(/⚠ \/compact/)
  })
})

describe('tasks', () => {
  test('the list works from commands, buttons and Claude’s tool, and persists', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'todo', 'Починить логин')).toBe('☐ #1 Починить логин')
    expect(await command($, w, 'todo', 'Написать тесты')).toBe('☐ #2 Написать тесты')
    expect((await band($, 140))[1]).toMatch(/☐ 0\/2  Починить логин/)

    const added = await $.tool.call({ tool: 'mcp__tabby__todo', action: 'add', text: 'Обновить README' } as never)
    expect(String(added.result)).toMatch(/Added #3/)
    const ticked = await $.tool.call({ tool: 'mcp__tabby__todo', action: 'done', id: 1 } as never)
    expect(String(ticked.result)).toMatch(/\[x\] #1 Починить логин/)
    const missing = await $.tool.call({ tool: 'mcp__tabby__todo', action: 'done', id: 42 } as never)
    expect(String(missing.result)).toMatch(/No item #42/)

    await command($, w, 'tab', 'tasks')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    await ui.press({ key: 'todo-2' })
    await w.clock.settle()
    let drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).toMatch(/☑ Починить логин/)
    expect(drawn).toMatch(/☑ Написать тесты/)
    expect(drawn).toMatch(/☐ Обновить README ✦/)
    await ui.input({ key: 'todo-new', text: 'Из панели' })
    await ui.press({ key: 'todo-clear' })
    await w.clock.settle()
    drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).not.toMatch(/Починить логин/)
    expect(drawn).toMatch(/☐ Из панели/)
    await ui.unmount()

    expect(w.store.get('todos:/repo')).toEqual([
      { id: 3, text: 'Обновить README', done: false, by: 'claude' },
      { id: 4, text: 'Из панели', done: false, by: 'user' },
    ])
    expect(await command($, w, 'todo', 'rm 3')).toBe('Задача #3 удалена.')
    expect(await command($, w, 'todo', 'done 99')).toBe('Нет задачи #99.')
  })

  test('Claude hears about the focus and the list only when they change', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await $.prompt.submit({ text: 'hi', wait: false, origin: ORIGIN })
    await command($, w, 'todo', 'Починить логин')
    await command($, w, 'focus', 'Авторизация')
    await $.prompt.submit({ text: 'go', wait: false, origin: ORIGIN })
    await $.prompt.submit({ text: 'more', wait: false, origin: ORIGIN })
    expect(w.context[0]).toEqual([])
    expect(w.context[1]![0]).toMatch(/focus goal: "Авторизация"/)
    expect(w.context[1]![0]).toMatch(/#1 Починить логин/)
    expect(w.context[2]).toEqual([])
  })

  test('a pomodoro counts down, ends with a toast and clears itself', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'focus', 'Плашка над вводом 25')).toBe('◎ Фокус: «Плашка над вводом» · 25 мин.')
    await w.clock.advance(10 * 60_000)
    expect((await band($, 140))[1]).toMatch(/◎ Плашка над вводом 15м/)
    await w.clock.advance(15 * 60_000)
    expect(w.toasts.some(t => /25 мин фокуса позади/.test(t))).toBe(true)
    expect(w.toasts.some(t => /В потоке/.test(t))).toBe(true)
    expect((await band($, 140))[1]).toMatch(/перерыв/)
    await w.clock.advance(11 * 60_000)
    expect((await band($, 140))[1]).not.toMatch(/◎/)
  })

  test('/focus parses goals, timers and stop', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'focus')).toMatch(/Использование/)
    expect(await command($, w, 'focus', 'рефакторинг 0')).toBe('◎ Фокус: «рефакторинг», без таймера.')
    expect(await command($, w, 'focus', 'stop')).toMatch(/Фокус «рефакторинг» завершён/)
    expect(await command($, w, 'focus', '2025')).toBe('◎ Фокус: «2025» · 25 мин.')
  })
})

describe('tests', () => {
  test('/test runs the detected command and shows the result; a fix earns a comeback', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'test')).toBe('Запускаю: npm test — результат появится в плашке.')
    expect(w.ran.find(a => a[0] === 'sh')).toEqual(['sh', '-c', 'npm test'])
    expect((await band($, 140))[1]).toMatch(/✗ 2 упало/)
    expect(w.toasts).toContain('✗ Упало тестов: 2')

    w.tests = { exitCode: 0, stdout: GREEN }
    await command($, w, 'test')
    expect((await band($, 140))[1]).toMatch(/✓ 42\/42/)
    expect(w.toasts.some(t => /Камбэк/.test(t))).toBe(true)
    expect(w.toasts.some(t => /снова зелёные/.test(t))).toBe(true)
  })

  test('tests Claude runs through Bash show up too', async ($, on) => {
    const w = world(on)
    await boot($, w)
    w.tests = { exitCode: 0, stdout: GREEN }
    await $.tool.call({ tool: 'Bash', command: 'npx vitest run' } as never)
    await w.clock.settle()
    expect((await band($, 140))[1]).toMatch(/✓ 42\/42/)
    await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true } as never)
    expect((await band($, 140))[1]).toMatch(/✓ 42\/42/)
  })

  test('no command found asks for one; a custom one is remembered', async ($, on) => {
    const w = world(on, {})
    await boot($, w)
    expect(await command($, w, 'test')).toMatch(/Задайте команду/)
    w.tests = { exitCode: 0, stdout: GREEN }
    await command($, w, 'test', 'make check')
    expect(w.ran.find(a => a[0] === 'sh')).toEqual(['sh', '-c', 'make check'])
    expect(w.store.get('testcmd:/repo')).toBe('make check')
  })
})

describe('pane', () => {
  test('every tab draws on every surface', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'todo', 'Задача')
    await command($, w, 'test')
    await turn($, w, 20_000, 2)
    for (const tab of ['overview', 'git', 'tasks', 'tests', 'pet']) {
      await command($, w, 'tab', tab)
      for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
        const ui = await $.ui.mount({ surface, ...PANE(56) })
        const drawn = lines((await ui.drawn()) as never)
        expect(drawn[0], `${tab} ${surface}`).toMatch(/1: Обзор\s+2: Git\s+3: Задачи\s+4: Тесты\s+5: Таби/)
        await ui.unmount()
      }
    }
  })

  test('tabs switch by their keys and the pane reads what happened', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await turn($, w, 34_000, 3)
    await command($, w, 'tab')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    let drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).toMatch(/КОНТЕКСТ/)
    expect(drawn).toMatch(/96k из 200k токенов/)
    expect(drawn).toMatch(/1 ход · 3 инстр · \$1\.24/)
    await ui.press({ key: 'tab-git' })
    drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).toMatch(/alexskvo10\/claude-tab/)
    expect(drawn).toMatch(/ M hooks\/register\.tsx/)
    expect(drawn).toMatch(/d7cb9a4 Initial commit/)
    await ui.press({ key: 'tab-pet' })
    drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).toMatch(/Таби · уровень/)
    expect(drawn).toMatch(/★ Первый шаг/)
    await ui.unmount()
  })
})

describe('Tabby', () => {
  test('grows with the work and keeps it across sessions', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await turn($, w, 5_000, 1)
    expect(w.toasts.some(t => /Первый шаг/.test(t))).toBe(true)
    expect(w.toasts.some(t => /Молния/.test(t))).toBe(true)
    const pet = (w.store.get('pet')) as { xp: number; achievements: string[] }
    expect(pet.achievements).toEqual(['first', 'lightning'])
    expect(pet.xp).toBe(2 + 15 + 15)
  })
})
