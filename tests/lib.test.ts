import { describe, expect, test } from 'claude-code/testing'

import { frameAt } from '../hooks/lib/anim'
import { bar, clock, compact, duration, minutesLeft, plural, sparkline, tokens, truncate, until } from '../hooks/lib/format'
import { addSample, burn, contextGrowth, turnsLeft } from '../hooks/lib/forecast'
import { parseLog, parseStatus, repoName } from '../hooks/lib/git'
import { fit, rowWidth } from '../hooks/lib/layout'
import type { Seg } from '../hooks/lib/layout'
import { setLang } from '../hooks/lib/i18n'
import { level, mood } from '../hooks/lib/pet'
import { base64, bigText, DEFAULT, pack, ring, sprite, squares, toCells } from '../hooks/lib/pixels'
import { PALETTE, bigCat, smallCat } from '../hooks/lib/sprites'
import { addToDay, dayKey, lastDays, streak } from '../hooks/lib/stats'
import { detectCommand, isTestCommand, parseFailures, parseSummary, tail } from '../hooks/lib/tests'

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

describe('forecast', () => {
  const turn = (context: number | undefined) => ({ ms: 1, tools: 0, errors: 0, tokens: 0, context, at: 0 })

  test('context growth needs a few turns and skips a compaction', () => {
    expect(contextGrowth([turn(10_000), turn(20_000)])).toBeUndefined()
    expect(contextGrowth([turn(10_000), turn(20_000), turn(30_000)])).toBe(10_000)
    expect(contextGrowth([turn(10_000), turn(20_000), turn(5_000), turn(15_000), turn(25_000)])).toBe(10_000)
    expect(turnsLeft(150_000, 200_000, 10_000)).toBe(5)
    expect(turnsLeft(150_000, 200_000, undefined)).toBeUndefined()
  })

  test('a limit burn needs ten minutes of one window', () => {
    const at = (min: number, percent: number, resetsAt = 'r1') => ({ at: min * 60_000, kind: 'five_hour', percent, resetsAt })
    expect(burn([at(0, 10), at(5, 20)], 'five_hour', 5 * 60_000, 3_600_000)).toBeUndefined()
    // 30 points in 15 minutes: 120%/h; 60 left: 30 minutes, before a reset in an hour
    const fast = burn([at(0, 10), at(15, 40)], 'five_hour', 15 * 60_000, 3_600_000)
    expect(fast?.perHour).toBe(120)
    expect(fast?.runsOutInMs).toBe(30 * 60_000)
    // the same pace with the reset in 20 minutes lasts
    expect(burn([at(0, 10), at(15, 40)], 'five_hour', 15 * 60_000, 20 * 60_000)?.runsOutInMs).toBeUndefined()
    // a new window starts the reading over
    expect(burn([at(0, 90, 'r0'), at(15, 5)], 'five_hour', 15 * 60_000, 3_600_000)).toBeUndefined()
  })

  test('samples keep one a minute and the last six hours', () => {
    const s1 = addSample([], { at: 0, kind: 'k', percent: 1 })
    expect(addSample(s1, { at: 30_000, kind: 'k', percent: 1 })).toHaveLength(1)
    expect(addSample(s1, { at: 30_000, kind: 'k', percent: 2 })).toHaveLength(2)
    expect(addSample(s1, { at: 7 * 3_600_000, kind: 'k', percent: 1 })).toHaveLength(1)
  })
})

describe('stats', () => {
  const now = new Date(2026, 9, 5, 15).getTime()
  const at = (daysBack: number) => now - daysBack * 86_400_000

  test('days add up and the streak counts back from today or yesterday', () => {
    let s = addToDay({ days: {} }, at(0), { turns: 2, costUsd: 0.5 })
    s = addToDay(s, at(0), { turns: 1, focusMs: 60_000 })
    expect(s.days[dayKey(now)]).toEqual({ turns: 3, tools: 0, focusMs: 60_000, costUsd: 0.5 })
    s = addToDay(addToDay(s, at(1), { turns: 1 }), at(2), { turns: 1 })
    expect(streak(s, now)).toBe(3)
    const noToday = addToDay(addToDay({ days: {} }, at(1), { turns: 1 }), at(2), { turns: 1 })
    expect(streak(noToday, now)).toBe(2)
    expect(streak(addToDay({ days: {} }, at(3), { turns: 1 }), now)).toBe(0)
    expect(lastDays(s, now, 3).map(d => d.day.turns)).toEqual([1, 1, 3])
  })
})

describe('failures', () => {
  test('each runner names its failing tests', () => {
    expect(parseFailures(' FAIL  src/a.test.ts > login works 12ms\n FAIL  src/a.test.ts > login works')).toEqual(['src/a.test.ts > login works'])
    expect(parseFailures('  ✕ adds numbers (3 ms)\n  ✓ subtracts')).toEqual(['adds numbers'])
    expect(parseFailures('FAILED tests/test_a.py::test_login - assert 1 == 2')).toEqual(['tests/test_a.py::test_login'])
    expect(parseFailures('test auth::login ... FAILED\ntest auth::other ... ok')).toEqual(['auth::login'])
    expect(parseFailures('--- FAIL: TestLogin (0.00s)')).toEqual(['TestLogin'])
    expect(parseFailures('(fail) login > rejects [0.12ms]')).toEqual(['login > rejects'])
    expect(parseFailures('all good')).toEqual([])
  })
})

describe('english', () => {
  test('units and words follow the language', () => {
    setLang('en')
    try {
      expect(duration(185_000)).toBe('3m 05s')
      expect(compact(8_040_000)).toBe('2h14m')
      expect(minutesLeft(90_000)).toBe('2m')
    } finally {
      setLang('ru')
    }
    expect(duration(185_000)).toBe('3м 05с')
  })
})


/** Reads packed cells back: [char, fg, bg] per cell. */
function unpack(cells: string): [string, number, number][] {
  const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  const clean = cells.replace(/=+$/, '')
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map(j => B.indexOf(clean[i + j] ?? 'A'))
    const v = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!
    bytes.push((v >> 16) & 255, (v >> 8) & 255, v & 255)
  }
  const words: number[] = []
  for (let i = 0; i + 4 <= bytes.length; i += 4) words.push((bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0)
  const out: [string, number, number][] = []
  for (let i = 0; i + 3 <= words.length; i += 3) out.push([String.fromCodePoint(words[i]!), words[i + 1]!, words[i + 2]!])
  return out
}

describe('pixels', () => {
  test('base64 is the standard padded kind', () => {
    expect(base64(new Uint8Array([]))).toBe('')
    expect(base64(new Uint8Array([102]))).toBe('Zg==')
    expect(base64(new Uint8Array([102, 111]))).toBe('Zm8=')
    expect(base64(new Uint8Array([102, 111, 111, 98, 97, 114]))).toBe('Zm9vYmFy')
  })

  test('two pixels make one half-block cell', () => {
    const s = sprite(['ab.', 'b.a'], { a: 0xff0000, b: 0x00ff00 })
    const c = toCells(s)
    expect(c.columns).toBe(3)
    expect(c.rows).toBe(1)
    expect(unpack(c.cells)).toEqual([
      ['▀', 0xff0000, 0x00ff00],
      ['▀', 0x00ff00, DEFAULT],
      ['▄', 0xff0000, DEFAULT],
    ])
    expect(unpack(pack([{ ch: ' ', fg: DEFAULT, bg: DEFAULT }], 1).cells)).toEqual([[' ', DEFAULT, DEFAULT]])
    expect(unpack(toCells(sprite(['a', 'a'], { a: 7 })).cells)).toEqual([['█', 7, DEFAULT]])
  })

  test('a ring fills clockwise from the top', () => {
    const empty = ring(0, 12, [1], 9)
    const full = ring(100, 12, [1], 9)
    expect(empty.px.filter(p => p === 1)).toHaveLength(0)
    expect(full.px.filter(p => p === 9)).toHaveLength(0)
    const half = ring(50, 12, [1], 9)
    // the right half is filled, the left is track
    expect(half.px[6 * 12 + 10]).toBe(1)
    expect(half.px[6 * 12 + 1]).toBe(9)
    // the middle is a hole
    expect(half.px[6 * 12 + 6]).toBeNull()
  })

  test('digits, squares and the cat have the sizes the drawings count on', () => {
    expect(toCells(bigText('24:59', 1))).toMatchObject({ columns: 17, rows: 3 })
    expect(toCells(squares(new Array(28).fill(1), 7, () => 1))).toMatchObject({ columns: 20, rows: 6 })
    for (const m of ['happy', 'work', 'sad', 'sleep', 'proud', 'focus'] as const) {
      for (let f = 0; f < 4; f += 1) {
        expect(toCells(smallCat(m, f)), `${m} ${f}`).toMatchObject({ columns: 11, rows: 3 })
        expect(toCells(bigCat(m, f)), `${m} ${f}`).toMatchObject({ columns: 20, rows: 8 })
      }
    }
  })

  test('Tabby blinks now and then and types while working', () => {
    expect(frameAt('happy', 100, 'small')).toBe(1)
    expect(frameAt('happy', 1000, 'small')).toBe(0)
    expect(frameAt('happy', 100, 'big')).toBe(3)
    expect(frameAt('happy', 1000, 'big')).toBe(1)
    expect(new Set([0, 280, 560, 840].map(ms => frameAt('work', ms, 'small'))).size).toBe(4)
    expect(frameAt('focus', 12345, 'big')).toBe(0)
  })

  test('the purring and the working band cat differ at a glance', () => {
    const at = (m: 'happy' | 'work', f: number) => Array.from(smallCat(m, f).px)
    expect(at('happy', 0)).not.toEqual(at('work', 0))
    // the laptop sits under the chin only while working
    const lid = PALETTE.X
    expect(at('work', 0)).toContain(lid)
    expect(at('happy', 0)).not.toContain(lid)
    // the heart is only in the purring frame that shows it
    expect(at('happy', 1)).toContain(PALETTE.H)
    expect(at('happy', 0)).not.toContain(PALETTE.H)
  })
})
