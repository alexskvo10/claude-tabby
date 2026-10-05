// The world beneath the plugin for the engine tests: a repo, a session with
// usage, a host that runs git, gh and tests, a store, a prompt box.
import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { lines } from './text'

export const NOW = Date.parse('2026-10-05T12:00:00Z')
export const RED = 'Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 40 passed (42)\n FAIL  src/auth.test.ts > login rejects bad password\n FAIL  src/auth.test.ts > token expires'
export const GREEN = '      Tests  42 passed (42)'

const STATUS = [
  '# branch.oid 0123456789abcdef',
  '# branch.head feature/band',
  '# branch.upstream origin/feature/band',
  '# branch.ab +1 -0',
  '1 .M N... 100644 100644 100644 aaa bbb hooks/register.tsx',
  '? notes.md',
].join('\n')

export type World = {
  toasts: string[]
  opened: string[]
  ran: string[][]
  tests: { exitCode: number; stdout: string }
  usage: { percent: number; fiveHour: number }
  pr: string | null
  gitDirty: boolean
  context: string[][]
  prompt: { text: string }
  sounds: string[]
  store: Map<string, unknown>
  clock: ReturnType<typeof mock.clock>
}

function done(exitCode: number, stdout: string, stderr = '') {
  return { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false }
}

export function world(
  on: On,
  setup: { files?: Record<string, string>; env?: Record<string, string>; store?: Record<string, unknown> } = {},
): World {
  const files = setup.files ?? { '/repo/package.json': '{"scripts":{"test":"vitest run"}}' }
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, setup.env ?? {})
  const w: World = {
    toasts: [],
    opened: [],
    ran: [],
    tests: { exitCode: 1, stdout: RED },
    usage: { percent: 48, fiveHour: 23 },
    pr: null,
    gitDirty: true,
    context: [],
    prompt: { text: '' },
    sounds: [],
    store: new Map(Object.entries(setup.store ?? {})),
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
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'status') return { value: done(0, w.gitDirty ? STATUS : STATUS.split('\n').slice(0, 4).join('\n')) }
    if (cmd === 'git' && sub === 'log') return { value: done(0, 'd7cb9a4\x1f1759600000\x1fInitial commit') }
    if (cmd === 'git' && sub === 'stash' && e.argv[2] === 'list') return { value: done(0, '') }
    if (cmd === 'git' && sub === 'stash') return { value: done(0, 'Saved working directory') }
    if (cmd === 'git' && sub === 'add') return { value: done(0, '') }
    if (cmd === 'git' && sub === 'commit') {
      w.gitDirty = false
      return { value: done(0, '[feature/band abc1234] msg') }
    }
    if (cmd === 'gh') return { value: w.pr === null ? done(1, '', 'no pull requests found') : done(0, w.pr) }
    if (cmd === 'sh' || cmd === 'cmd.exe') return { value: done(w.tests.exitCode, w.tests.stdout) }
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
  on('audio.play', ($, e) => {
    w.sounds.push(String(e.clip.asset))
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: w.prompt.text, cursor: w.prompt.text.length } }))
  on('prompt.fill', ($, e) => {
    w.prompt.text = e.mode === 'append' ? w.prompt.text + e.text : e.text
    return { isFilled: true, box: { text: w.prompt.text, cursor: w.prompt.text.length } }
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

export async function boot($: Engine, w: World): Promise<void> {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
}

const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: true, columns: 140 } as never

export async function command($: Engine, w: World, name: string, args = ''): Promise<string> {
  const ran = await $.command.run({ command: name, args, origin: ORIGIN, presentation: PRESENTATION })
  await w.clock.settle()
  return ran.text ?? ''
}

export async function submit($: Engine, text: string): Promise<void> {
  await $.prompt.submit({ text, wait: false, origin: ORIGIN })
}

export async function turn($: Engine, w: World, ms: number, tools: number, tool = 'Read'): Promise<void> {
  await $.turn.start({ text: 'go', turnId: `t${ms}-${w.clock.now()}` })
  for (let i = 0; i < tools; i += 1) await $.tool.call({ tool, file_path: '/repo/a.ts', command: 'ls', old_string: 'a', new_string: 'b', content: 'x' } as never)
  await w.clock.advance(ms)
  await $.turn.complete({
    answer: 'done',
    durationMs: ms,
    isAborted: false,
    turnId: 't',
    reason: 'answer',
    usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0, model: 'm' },
  } as never)
  await w.clock.settle()
}

export const BAND = (bodyColumns: number, isWorking = false) => ({
  plugin: 'tabby',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 9 }, view: {} },
})

export const PANE = (bodyColumns: number) => ({
  plugin: 'tabby',
  component: 'Pane' as const,
  requestId: 'tabby',
  props: { title: 'Tabby', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 } } as never,
})

export async function band($: Engine, cols: number, surface: 'terminal' | 'desktop' = 'terminal'): Promise<string[]> {
  const ui = await $.ui.mount({ surface, ...BAND(cols) })
  const drawn = lines((await ui.drawn()) as never)
  await ui.unmount()
  return drawn
}

export async function pane($: Engine, w: World, tab: string, cols = 60, surface: 'terminal' | 'desktop' | 'vscode' | 'mobile' = 'terminal'): Promise<string> {
  await command($, w, 'tab', tab)
  const ui = await $.ui.mount({ surface, ...PANE(cols) })
  const drawn = lines((await ui.drawn()) as never).join('\n')
  await ui.unmount()
  return drawn
}
