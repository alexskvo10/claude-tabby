import { describe, expect, test } from 'claude-code/testing'

import { bar, clock, compact, duration, plural, sparkline, tokens, truncate, until } from '../hooks/lib/format'
import { parseLog, parseStatus, repoName } from '../hooks/lib/git'
import { fit, rowWidth } from '../hooks/lib/layout'
import type { Seg } from '../hooks/lib/layout'
import { level, mood } from '../hooks/lib/pet'
import { detectCommand, isTestCommand, parseSummary, tail } from '../hooks/lib/tests'
import { minutesLeft } from '../hooks/ui/parts'

describe('format', () => {
  test('tokens and spans read short', () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(1234)).toBe('1.2k')
    expect(tokens(96_100)).toBe('96k')
    expect(tokens(1_000_000)).toBe('1.0M')
    expect(duration(9_000)).toBe('9с')
    expect(duration(185_000)).toBe('3м 05с')
    expect(duration(72 * 60_000)).toBe('1ч 12м')
    expect(duration((3 * 24 + 4) * 3_600_000)).toBe('3д 4ч')
    expect(compact(8_040_000)).toBe('2ч14м')
    expect(clock(25 * 60_000)).toBe('25:00')
    expect(clock(3_723_000)).toBe('1:02:03')
  })

  test('bars never overflow and show any use at all', () => {
    expect(bar(0, 8)).toEqual({ fill: '', rest: '▱▱▱▱▱▱▱▱' })
    expect(bar(1, 8).fill).toBe('▰')
    expect(bar(150, 4)).toEqual({ fill: '▰▰▰▰', rest: '' })
    expect(bar(50, 10).fill.length + bar(50, 10).rest.length).toBe(10)
  })

  test('truncate, plural, sparkline, until', () => {
    expect(truncate('hello world', 6)).toBe('hello…')
    expect(truncate('hi', 6)).toBe('hi')
    expect(plural(1, 'ход', 'хода', 'ходов')).toBe('ход')
    expect(plural(3, 'ход', 'хода', 'ходов')).toBe('хода')
    expect(plural(11, 'ход', 'хода', 'ходов')).toBe('ходов')
    expect(plural(22, 'ход', 'хода', 'ходов')).toBe('хода')
    expect(sparkline([0, 5, 10])).toBe('▁▄█')
    expect(sparkline([0, 0])).toBe('▁▁')
    expect(until('2026-01-01T00:10:00Z', Date.parse('2026-01-01T00:00:00Z'))).toBe(600_000)
    expect(until('nonsense', 0)).toBeUndefined()
    expect(until(undefined, 0)).toBeUndefined()
  })

  test('a countdown never reads zero early', () => {
    expect(minutesLeft(0)).toBe('0м')
    expect(minutesLeft(1)).toBe('1м')
    expect(minutesLeft(17 * 60_000 + 30_000)).toBe('18м')
    expect(minutesLeft(25 * 60_000)).toBe('25м')
    expect(minutesLeft(90 * 60_000)).toBe('1ч30м')
  })
})

describe('git', () => {
  test('reads porcelain v2 with branch, counts and odd paths', () => {
    const status = [
      '# branch.oid 0123456789abcdef',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 aaa bbb src/a.ts',
      '1 .M N... 100644 100644 100644 aaa bbb src/with space.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\told.ts',
      'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
      '? notes.md',
    ].join('\n')
    const s = parseStatus(status)
    expect(s.branch).toBe('main')
    expect(s.upstream).toBe('origin/main')
    expect(s.ahead).toBe(2)
    expect(s.behind).toBe(1)
    expect(s.staged).toBe(2)
    expect(s.changed).toBe(1)
    expect(s.untracked).toBe(1)
    expect(s.conflicts).toBe(1)
    expect(s.files.map(f => f.path)).toEqual(['src/a.ts', 'src/with space.ts', 'new.ts', 'conflict.ts', 'notes.md'])
    expect(s.files.map(f => f.code)).toEqual(['M', 'M', 'R', 'U', '?'])
  })

  test('a detached head shows its short id; a fresh repo has no upstream', () => {
    expect(parseStatus('# branch.oid 0123456789abcdef\n# branch.head (detached)\n').branch).toBe('@0123456')
    const fresh = parseStatus('# branch.oid (initial)\n# branch.head main\n')
    expect(fresh.upstream).toBeNull()
    expect(fresh.ahead).toBe(0)
  })

  test('log and remote names', () => {
    expect(parseLog('d7cb9a4\x1f1700000000\x1fInitial commit\nabc\x1f1700000100\x1ffix: a\x1fb')).toEqual([
      { hash: 'd7cb9a4', at: 1_700_000_000_000, subject: 'Initial commit' },
      { hash: 'abc', at: 1_700_000_100_000, subject: 'fix: a\x1fb' },
    ])
    expect(parseLog('')).toEqual([])
    expect(repoName('git@github.com:alexskvo10/claude-tab.git')).toBe('alexskvo10/claude-tab')
    expect(repoName('https://github.com/alexskvo10/claude-tab')).toBe('alexskvo10/claude-tab')
    expect(repoName('http://local_proxy@127.0.0.1:1234/git/owner/repo')).toBe('owner/repo')
    expect(repoName(null)).toBeNull()
  })
})

describe('tests', () => {
  test('recognises test commands, and only those', () => {
    for (const c of ['npm test', 'npm run test -- --watch=false', 'pnpm test', 'bun test', 'cd app && yarn test', 'pytest -q', 'python -m pytest', 'cargo test', 'go test ./...', 'npx vitest run', 'make test', 'npm test -- a.test.ts', 'jest', './gradlew test', '(cd web && pnpm test)']) {
      expect(isTestCommand(c), c).toBe(true)
    }
    for (const c of ['npm install', 'git status', 'ls tests/', 'cat test.txt', 'echo latest', 'cat jest.config.js', 'vim pytest.ini', 'npm run test:e2e:update-snapshots']) {
      expect(isTestCommand(c), c).toBe(false)
    }
  })

  test('reads each runner summary', () => {
    expect(parseSummary('Test Suites: 1 failed, 2 passed, 3 total\nTests:       1 failed, 41 passed, 42 total')).toEqual({ passed: 41, failed: 1, total: 42 })
    expect(parseSummary(' Test Files  3 passed (3)\n      Tests  40 passed (40)')).toEqual({ passed: 40, failed: 0, total: 40 })
    expect(parseSummary('===== 2 failed, 40 passed in 1.23s =====')).toEqual({ passed: 40, failed: 2, total: 42 })
    expect(parseSummary('test result: ok. 10 passed; 0 failed; 0 ignored\ntest result: FAILED. 3 passed; 1 failed;')).toEqual({ passed: 13, failed: 1, total: 14 })
    expect(parseSummary(' 41 pass\n 1 fail\nRan 42 tests')).toEqual({ passed: 41, failed: 1, total: 42 })
    expect(parseSummary('ok  \tgithub.com/a/b\t0.1s\nFAIL\tgithub.com/a/c\t0.2s')).toEqual({ passed: 1, failed: 1, total: 2 })
    expect(parseSummary('\x1b[32mTests:\x1b[0m 5 passed, 5 total')).toEqual({ passed: 5, failed: 0, total: 5 })
    expect(parseSummary('nothing to see')).toEqual({})
  })

  test('tail keeps the last lines without colour', () => {
    expect(tail('a\nb\n\x1b[31mc\x1b[0m\n\n', 2)).toBe('b\nc')
  })

  test('detects the project command', async () => {
    const files = (map: Record<string, string>) => ({
      exists: async (p: string) => p in map,
      read: async (p: string) => map[p],
    })
    expect(await detectCommand(files({ 'package.json': '{"scripts":{"test":"vitest"}}', 'pnpm-lock.yaml': '' }))).toBe('pnpm test')
    expect(await detectCommand(files({ 'package.json': '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' }))).toBeNull()
    expect(await detectCommand(files({ 'Cargo.toml': '' }))).toBe('cargo test')
    expect(await detectCommand(files({ 'pyproject.toml': '' }))).toBe('python -m pytest -q')
    expect(await detectCommand(files({ Makefile: 'build:\n\tgo build\ntest:\n\tgo test' }))).toBe('make test')
    expect(await detectCommand(files({}))).toBeNull()
  })
})

describe('layout and pet', () => {
  test('fit drops the lowest rank first and keeps order', () => {
    const seg = (id: string, rank: number, text: string): Seg => ({ id, rank, parts: [{ text }] })
    const row = [seg('a', 10, 'aaaa'), seg('b', 1, 'bbbb'), seg('c', 5, 'cccc')]
    expect(rowWidth(row)).toBe(16)
    expect(fit(row, 16).map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(fit(row, 12).map(s => s.id)).toEqual(['a', 'c'])
    expect(fit(row, 5).map(s => s.id)).toEqual(['a'])
    expect(fit(row, 2)).toEqual([])
  })

  test('levels grow and moods follow the session', () => {
    expect(level(0)).toEqual({ level: 1, into: 0, span: 20 })
    expect(level(20).level).toBe(2)
    expect(level(54).level).toBe(2)
    expect(level(55).level).toBe(3)
    const base = { isWorking: false, isTestsRed: false, isFocused: false, idleMs: 0, sinceUnlockMs: 1e9 }
    expect(mood(base)).toBe('happy')
    expect(mood({ ...base, isWorking: true })).toBe('work')
    expect(mood({ ...base, isTestsRed: true })).toBe('sad')
    expect(mood({ ...base, idleMs: 20 * 60_000 })).toBe('sleep')
    expect(mood({ ...base, isWorking: true, sinceUnlockMs: 1000 })).toBe('proud')
  })
})
