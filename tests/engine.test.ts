import { describe, expect, test } from 'claude-code/testing'

import { lines } from './text'
import { BAND, band, boot, card, command, GREEN, NOW, PANE, pane, RED, submit, turn, world } from './world'

describe('band', () => {
  test('draws the session row and the work row on both surfaces', async ($, on) => {
    const w = world(on)
    await boot($, w)
    for (const surface of ['terminal', 'desktop'] as const) {
      const [session, work, intro] = await band($, 140, surface)
      expect(session).toMatch(/ctx █+ 48% 96k\/200k {3,}5ч █+ 23% ↻ 2ч14м {3,}7д █+ 41% ↻ 3д4ч {3,}\$1\.24/)
      // the cat is pixel art: cells on the terminal, SVG on the desktop
      expect(session).toStartWith('ctx')
      expect(session).toEndWith('≡')
      expect(work).toBe('⎇ feature/band ↑1 ✚2')
      expect(intro).toMatch(/^Tabby: ≡ или \/tab — панель/)
    }
  })

  test('the intro hint shows in the first three sessions only', async ($, on) => {
    const w = world(on, { store: { prefs: { isCompact: false, tab: 'overview', isPetShown: true, introSeen: 3 } } })
    await boot($, w)
    const drawn = await band($, 140)
    // the pixel cat keeps three rows; the third is blank once the hint is done
    expect(drawn).toHaveLength(3)
    expect(drawn.join('\n')).not.toMatch(/Tabby:/)
  })

  test('a reload is not a new session for the intro hint', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await boot($, w)
    await boot($, w)
    expect(w.store.get('prefs')).toMatchObject({ introSeen: 1 })
  })

  test('never draws wider than its box, and keeps the essentials when narrow', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'todo', '!Очень длинная задача, которая точно не поместится в узкую плашку')
    await command($, w, 'focus', 'Длинная цель фокуса для проверки обрезки 25')
    await turn($, w, 34_000, 3)
    for (const cols of [30, 40, 50, 64, 80, 96, 120, 160, 220]) {
      const drawn = await band($, cols)
      for (const line of drawn) expect(Array.from(line).length, `${cols}: ${line}`).toBeLessThanOrEqual(cols)
      expect(drawn[0], `${cols}`).toMatch(/ctx/)
      if (cols >= 50) expect(drawn[1], `${cols}`).toMatch(/feature\/band/)
    }
  })

  test('the rows line their blocks up in columns', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'todo', '!Починить логин')
    await command($, w, 'focus', 'Плашка над вводом 25')
    await turn($, w, 34_000, 3)
    for (const surface of ['terminal', 'desktop'] as const) {
      const [session, work, tasks] = await band($, 120, surface)
      // the second column: the 5h limit, git and the list start in one place
      const at = Array.from(session!).join('').indexOf('5ч')
      expect(work!.indexOf('⎇'), surface).toBe(at)
      expect(tasks!.indexOf('☐'), surface).toBe(at)
      expect(session).not.toMatch(/│/)
      // all three bars are one length
      expect(session!.match(/█+/g)!.map(m => m.length)).toEqual([10, 10, 10])
    }
  })

  test('shows a live turn with its clock, tool count and last tool', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await $.turn.start({ text: 'go', turnId: 'live' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' } as never)
    await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
    await w.clock.advance(12_000)
    const [session, work] = await band($, 140, 'desktop')
    expect(session).toMatch(/^ctx/)
    expect(work).toMatch(/^[●◉○] 12с · 2 инстр · Grep/)
    const ui = await $.ui.mount({ surface: 'terminal', ...BAND(140, true) })
    expect(await ui.find({ type: 'Raster', key: 'cat' })).toBeDefined()
    await ui.unmount()
  })

  test('off the terminal Tabby is an SVG that plays its own loop', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await $.turn.start({ text: 'go', turnId: 'live' })
    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ surface, ...BAND(140, true) })
      const cat = (await ui.find({ type: 'Svg' })) as unknown as
        | { props: { source: string; alt: string; isInteractive?: boolean; width?: number; height?: number } }
        | undefined
      expect(cat, surface).toBeDefined()
      // its own size, as an image: an interactive frame is painted white on the desktop
      expect(cat!.props).toMatchObject({ width: 88, height: 48 })
      expect(cat!.props.alt).toBe('помогает')
      expect(cat!.props.source).toStartWith('<svg')
      expect(cat!.props.source).toContain('<animate')
      expect(cat!.props.isInteractive).toBeUndefined()
      expect(cat!.props.source.length).toBeLessThan(131_072)
      await ui.unmount()
    }
    // the pane's big cat, rings, squares and clock are SVG too, each within the bound
    await command($, w, 'focus', 'Плашка 25')
    for (const tab of ['pet', 'overview', 'tasks']) {
      await command($, w, 'tab', tab)
      const ui = await $.ui.mount({ surface: 'desktop', ...PANE(100) })
      const all = (await ui.findAll({ type: 'Svg' })) as unknown as { props: { source: string } }[]
      expect(all.length, tab).toBeGreaterThan(0)
      for (const svg of all) expect(svg.props.source.length).toBeLessThan(131_072)
      await ui.unmount()
    }
  })

  test('with Animate Tabby off the SVG cat holds still', { options: { animate: false } }, async ($, on) => {
    const w = world(on)
    await boot($, w)
    const ui = await $.ui.mount({ surface: 'desktop', ...BAND(140) })
    const cat = (await ui.find({ type: 'Svg' })) as unknown as { props: { source: string; isInteractive?: boolean } }
    expect(cat.props.source).not.toContain('<animate')
    expect(cat.props.isInteractive).toBeUndefined()
    await ui.unmount()
  })

  test('every block has a card with its details', async ($, on) => {
    const w = world(on)
    await boot($, w)
    const ui = await $.ui.mount({ surface: 'terminal', ...BAND(140) })
    expect(await ui.find({ type: 'Text', text: /Контекст: 96k из 200k токенов \(48%\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Лимит 5ч: 23%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /сброс в \d+:14 \(через 2ч 14м\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 изменённых файла/ })).toBeDefined()
    await ui.unmount()
    // off the terminal a card is one text that wraps: its pieces are never cut one by one
    const desk = await $.ui.mount({ surface: 'desktop', ...BAND(140) })
    const limit = (await desk.find({ type: 'Text', text: /^› Лимит 5ч: 23% · сброс в \d+:14 \(через 2ч 14м\)/ })) as unknown as
      | { props: { wrap?: string } }
      | undefined
    expect(limit?.props.wrap).toBe('wrap')
    await desk.unmount()
  })

  test('labels are buttons: they open their tab or act', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'test')
    const ui = await $.ui.mount({ surface: 'terminal', ...BAND(140) })
    await ui.press({ key: 'work-git-1' })
    await w.clock.settle()
    expect(w.opened).toEqual(['tabby'])
    expect(w.store.get('prefs')).toMatchObject({ tab: 'git' })
    await ui.press({ key: 'work-tests-1' })
    await w.clock.settle()
    expect(w.prompt.text).toBe('Почини упавшие тесты:\n- src/auth.test.ts > login rejects bad password\n- src/auth.test.ts > token expires')
    await ui.press({ key: 'open' })
    await w.clock.settle()
    expect(w.opened).toHaveLength(2)
    await ui.unmount()
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
})

describe('forecasts', () => {
  test('the context shows how many turns it has left', async ($, on) => {
    const w = world(on)
    await boot($, w)
    for (const pct of [40, 46, 52, 58]) {
      w.usage.percent = pct
      await turn($, w, 20_000, 1)
    }
    // 12k tokens a turn, 116k used of 200k: 7 turns
    expect((await band($, 140))[0]).toMatch(/58%\s+≈7 ходов/)
    expect(await pane($, w, 'overview')).toMatch(/\+12k\/ход · ≈7 ходов/)
  })

  test('a limit burning faster than its window warns before it runs out', async ($, on) => {
    const w = world(on)
    await boot($, w)
    for (let i = 1; i <= 8; i += 1) {
      w.usage.fiveHour = 23 + i * 4
      await w.clock.advance(150_000)
    }
    // 32 points in 20 minutes: 96%/h, 45% left, about 28 minutes, before the 2h reset
    const [session] = await band($, 160)
    // the band keeps the reset; the forecast is in the card, the toast and the pane
    expect(session).toMatch(/5ч [█▏▎▍▌▋▊▉ ]+55% ↻ 1ч\d+м/)
    expect(w.toasts.some(t => /При таком темпе лимит 5ч кончится через/.test(t))).toBe(true)
    expect(await pane($, w, 'overview')).toMatch(/⚠ лимит 5ч кончится раньше сброса/)
    expect(await card($, w, 'overview', 'card-limits')).toMatch(/55%\s+41%\n5ч\s+7д\n↻ 1ч\d+м\s+↻ 3д3ч\n⚠ 2\dм/)
  })

  test('every session shows the freshest limits any session has seen', async ($, on) => {
    const SHARED = '/home/.claude/tabby-limits.json'
    // another chat heard of the limits a second ago; this one's are from its last reply, long since
    const files: Record<string, string> = {
      '/repo/package.json': '{"scripts":{"test":"vitest run"}}',
      [SHARED]: JSON.stringify({ at: NOW - 1000, limits: [{ kind: 'five_hour', percent: 77, resetsAt: '2026-10-05T14:14:00Z' }] }),
    }
    const w = world(on, { env: { HOME: '/home' }, files })
    await boot($, w)
    expect((await band($, 140))[0]).toMatch(/5ч █+ 77%/)
    // a reply of its own makes this session's figures the newest, for everyone
    await turn($, w, 5_000, 1)
    expect((await band($, 140))[0]).toMatch(/5ч █+ 23%/)
    expect(JSON.parse(files[SHARED]!).limits[0]).toMatchObject({ kind: 'five_hour', percent: 23 })
  })

  test('warn once as context and limits fill up', async ($, on) => {
    const w = world(on)
    await boot($, w)
    w.usage = { percent: 91, fiveHour: 82 }
    await w.clock.advance(30_000)
    expect(w.toasts.filter(t => /Контекст заполнен на 90%/.test(t))).toHaveLength(1)
    expect(w.toasts.filter(t => /Контекст заполнен на 80%/.test(t))).toHaveLength(0)
    expect(w.toasts.some(t => /Лимит 5ч израсходован на 82%/.test(t))).toBe(true)
    const count = w.toasts.length
    await w.clock.advance(60_000)
    expect(w.toasts.length).toBe(count)
    expect((await band($, 140))[0]).toMatch(/⚠ \/compact/)
  })
})

describe('git', () => {
  test('shows the PR and its checks; all green earns Ship it', async ($, on) => {
    const w = world(on)
    w.pr = JSON.stringify({
      number: 12,
      title: 'Add the band',
      url: 'https://github.com/alexskvo10/claude-tab/pull/12',
      state: 'OPEN',
      isDraft: false,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }],
    })
    await boot($, w)
    expect((await band($, 140))[1]).toMatch(/⎇ feature\/band ↑1 ✚2 #12 ✓/)
    const branch = await card($, w, 'git', 'card-branch')
    expect(branch).toMatch(/ PR #12 \nAdd the band\n✓ проверки: 2 ✓ · 0 ✗ · 0 ⋯/)
    expect(w.toasts.some(t => /Ship it/.test(t))).toBe(true)
  })

  test('commits from the pane, and stash asks twice', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'tab', 'git')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    await ui.press({ key: 'git-stash' })
    await w.clock.settle()
    expect(lines((await ui.drawn()) as never).join('\n')).toMatch(/\[ Точно\? Нажмите ещё раз \]/)
    expect(w.ran.some(a => a[1] === 'stash' && a[2] === 'push')).toBe(false)
    await ui.press({ key: 'git-stash' })
    await w.clock.settle()
    expect(w.ran.find(a => a[1] === 'stash' && a[2] === 'push')).toBeDefined()

    await ui.input({ key: 'git-commit', text: 'Add band' })
    await w.clock.settle()
    expect(w.ran.find(a => a[1] === 'commit')).toEqual(['git', 'commit', '-m', 'Add band'])
    expect(w.toasts).toContain('Закоммичено: Add band')
    expect(w.toasts.some(t => /Коммитер/.test(t))).toBe(true)
    await ui.unmount()
  })

  test('a stash press not repeated in time disarms itself', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'tab', 'git')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    await ui.press({ key: 'git-stash' })
    await w.clock.advance(6000)
    await ui.press({ key: 'git-stash' })
    await w.clock.settle()
    expect(w.ran.some(a => a[1] === 'stash' && a[2] === 'push')).toBe(false)
    await ui.unmount()
  })
})

describe('tasks', () => {
  test('the list works from commands, buttons and Claude’s tool, and persists', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'todo', 'Починить логин')).toBe('☐ #1 Починить логин')
    expect(await command($, w, 'todo', '!Написать тесты')).toBe('☐ #2 ! Написать тесты')
    expect(await command($, w, 'todo', '* Обновить резюме')).toBe('☐ #3 Обновить резюме ◆')
    // the important one leads in the band
    expect((await band($, 140))[2]).toMatch(/☐ 0\/3 ! Написать тесты/)

    const added = await $.tool.call({ tool: 'mcp__tabby__todo', action: 'add', text: 'README', important: true } as never)
    expect(String(added.result)).toMatch(/Added #4/)
    const ticked = await $.tool.call({ tool: 'mcp__tabby__todo', action: 'done', id: 1 } as never)
    expect(String(ticked.result)).toMatch(/\[x\] #1 Починить логин/)
    expect(String((await $.tool.call({ tool: 'mcp__tabby__todo', action: 'done', id: 42 } as never)).result)).toMatch(/No item #42/)

    await command($, w, 'tab', 'tasks')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    await ui.press({ key: 'todo-2' })
    await ui.input({ key: 'todo-new', text: 'Из панели' })
    const list = async () => lines((await ui.find({ key: 'card-todo' })) as never).join('\n')
    expect(await list()).toMatch(/! ☐ README ✦\n☐ Обновить резюме ◆\n☐ Из панели\n☑ Починить логин\n☑ Написать тесты/)
    await ui.press({ key: 'todo-clear' })
    expect(await list()).not.toMatch(/Починить логин/)
    await ui.unmount()

    expect(w.store.get('todos:*')).toEqual([{ id: 3, text: 'Обновить резюме', done: false, by: 'user', isGlobal: true }])
    expect(w.store.get('todos:/repo')).toEqual([
      { id: 4, text: 'README', done: false, by: 'claude', isHigh: true },
      { id: 5, text: 'Из панели', done: false, by: 'user' },
    ])
    expect(await command($, w, 'todo', 'rm 4')).toBe('Задача #4 удалена.')
    expect(await command($, w, 'todo', 'done 99')).toBe('Нет задачи #99.')
  })

  test('Claude’s plan shows in the band and the tab, and leaves when done', async ($, on) => {
    const w = world(on)
    await boot($, w)
    const todos = (s: string[]) =>
      ['Read the code', 'Write the fix', 'Run the tests'].map((content, i) => ({ content, activeForm: `${content.replace(/^(\w+)/, '$1ing')}`, status: s[i] }))
    await $.turn.start({ text: 'go', turnId: 'p' })
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'in_progress', 'pending']) } as never)
    expect((await band($, 160))[2]).toMatch(/▸ план 1\/3 Writeing the fix/)
    expect(await card($, w, 'tasks', 'card-plan')).toMatch(/ПЛАН CLAUDE  1\/3\n.+\n✓ Read the code\n▸ Writeing the fix\n○ Run the tests/)
    await $.tool.call({ tool: 'TodoWrite', todos: todos(['completed', 'completed', 'completed']) } as never)
    await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 'p', reason: 'answer' } as never)
    expect((await band($, 160)).join('\n')).not.toMatch(/план/)
  })

  test('a subagent’s plan does not replace Claude’s', async ($, on) => {
    const w = world(on)
    await boot($, w)
    const plan = (content: string) => [{ content, activeForm: content, status: 'in_progress' }]
    await $.tool.call({ tool: 'TodoWrite', todos: plan('Main step') } as never)
    await $.tool.call({ tool: 'TodoWrite', todos: plan('Subagent step'), agentId: 'sub-1' } as never)
    expect((await band($, 160))[2]).toMatch(/▸ план 0\/1 Main step/)
  })

  test('Claude hears about the focus and the list only when they change', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await submit($, 'hi')
    await command($, w, 'todo', '!Починить логин')
    await command($, w, 'focus', 'Авторизация')
    await submit($, 'go')
    await submit($, 'more')
    expect(w.context[0]).toEqual([])
    expect(w.context[1]![0]).toMatch(/focus goal: "Авторизация"/)
    expect(w.context[1]![0]).toMatch(/#1 \(important\) Починить логин/)
    expect(w.context[2]).toEqual([])
  })

  test('a pomodoro counts down, chimes, counts toward today and clears itself', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'focus', 'Плашка над вводом 25')).toBe('◎ Фокус: «Плашка над вводом» · 25 мин.')
    await w.clock.advance(10 * 60_000)
    expect((await band($, 140))[2]).toMatch(/◎ Плашка над вводом 15м/)
    expect(await card($, w, 'tasks', 'card-focus')).toMatch(/осталось 15:00 из 25 мин/)
    await w.clock.advance(15 * 60_000)
    expect(w.toasts.some(t => /25 мин фокуса позади/.test(t))).toBe(true)
    expect(w.sounds).toEqual(['assets/chime.wav'])
    expect((await band($, 140))[2]).toMatch(/перерыв/)
    await w.clock.advance(11 * 60_000)
    expect((await band($, 140)).join('\n')).not.toMatch(/◎/)
    expect(await card($, w, 'overview', 'card-today')).toMatch(/0 ходов · ◎ 25м/)
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
  test('/test shows the result and the failing tests; a click asks Claude to fix one', async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect(await command($, w, 'test')).toBe('Запускаю: npm test — результат появится в плашке.')
    expect(w.ran.find(a => a[0] === 'sh')).toEqual(['sh', '-c', 'npm test'])
    expect((await band($, 140))[1]).toMatch(/✗ 2 упало/)
    expect(w.toasts).toContain('✗ Упало тестов: 2')

    await command($, w, 'tab', 'tests')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(70) })
    const failures = lines((await ui.find({ key: 'card-failures' })) as never).join('\n')
    expect(failures).toMatch(/УПАВШИЕ ТЕСТЫ  2\n✗ src\/auth\.test\.ts > login rejects bad password\n✗ src\/auth\.test\.ts > token expires/)
    w.prompt.text = 'draft'
    await ui.press({ key: 'fail-1' })
    expect(w.prompt.text).toBe('draft\nПочини упавший тест: src/auth.test.ts > token expires')
    await ui.unmount()

    w.tests = { exitCode: 0, stdout: GREEN }
    await command($, w, 'test')
    expect((await band($, 140))[1]).toMatch(/✓ 42\/42/)
    expect(w.toasts.some(t => /Камбэк/.test(t))).toBe(true)
    expect(await card($, w, 'tests', 'card-tests')).toMatch(/История  ●●/)
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

  test('with autoTests on, a turn that edited files runs the tests', { options: { autoTests: true } }, async ($, on) => {
    const w = world(on)
    await boot($, w)
    await turn($, w, 5_000, 2, 'Read')
    expect(w.ran.some(a => a[0] === 'sh')).toBe(false)
    await turn($, w, 5_000, 2, 'Edit')
    expect(w.ran.filter(a => a[0] === 'sh')).toHaveLength(1)
    expect(await pane($, w, 'tests')).toMatch(/автопрогон/)
  })

  test('no command found asks for one; a custom one is remembered', async ($, on) => {
    const w = world(on, { files: {} })
    await boot($, w)
    expect(await command($, w, 'test')).toMatch(/Задайте команду/)
    w.tests = { exitCode: 0, stdout: GREEN }
    await command($, w, 'test', 'make check')
    expect(w.ran.find(a => a[0] === 'sh')).toEqual(['sh', '-c', 'make check'])
    expect(w.store.get('testcmd:/repo')).toBe('make check')
  })
})

describe('pane', () => {
  test('every tab draws on every surface, with badges on the tabs', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'todo', 'Задача')
    await command($, w, 'test')
    await turn($, w, 20_000, 2)
    for (const tab of ['overview', 'git', 'tasks', 'tests', 'pet']) {
      for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
        const drawn = (await pane($, w, tab, 56, surface)).split('\n')
        expect(drawn[0], `${tab} ${surface}`).toMatch(/1: Обзор\s+2: Git ✚2\s+3: Задачи 1\s+4: Тесты ✗\s+5: Таби/)
        expect(drawn.at(-1)!.length, `${tab} ${surface}: the key hint`).toBeGreaterThan(10)
      }
    }
  })

  test('tabs switch by their keys and read what happened', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await turn($, w, 34_000, 3)
    await command($, w, 'tab')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    const of = async (key: string) => lines((await ui.find({ key })) as never).join('\n')
    let drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).toMatch(/✓ всё спокойно/)
    expect(await of('card-context')).toMatch(/96k/)
    expect(await of('card-context')).toMatch(/из 200k токенов/)
    expect(await of('card-session')).toMatch(/1 ход · 3 инстр · \$1\.24/)
    expect(await of('card-session')).toMatch(/последний: 34с · 3 инстр · 42k ток/)
    expect(await of('card-today')).toMatch(/СЕГОДНЯ\n1 ход/)
    await ui.press({ key: 'tab-git' })
    drawn = lines((await ui.drawn()) as never).join('\n')
    expect(drawn).toMatch(/alexskvo10\/claude-tab/)
    expect(drawn).toMatch(/ M hooks\/register\.tsx/)
    expect(drawn).toMatch(/d7cb9a4 Initial commit/)
    await ui.press({ key: 'tab-pet' })
    expect(await of('card-tabby')).toMatch(/УРОВЕНЬ \d/)
    expect(await of('card-unlocked')).toMatch(/★ Первый шаг/)
    await ui.unmount()
  })

  test('a terminal that draws pictures gets the pixel cat', async ($, on) => {
    const w = world(on, { env: { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' } })
    await boot($, w)
    await command($, w, 'tab', 'pet')
    const ui = await $.ui.mount({ surface: 'terminal', ...PANE(60) })
    expect(await ui.find({ type: 'Image', key: 'cat' })).toBeDefined()
    await ui.unmount()
    const desktop = await $.ui.mount({ surface: 'desktop', ...PANE(60) })
    expect(await desktop.find({ type: 'Image' })).toBeUndefined()
    await desktop.unmount()
  })
})

describe('Tabby', () => {
  test('grows with the work and keeps it across sessions', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await turn($, w, 5_000, 1)
    expect(w.toasts.some(t => /Первый шаг/.test(t))).toBe(true)
    expect(w.toasts.some(t => /Молния/.test(t))).toBe(true)
    const pet = w.store.get('pet') as { xp: number; achievements: string[] }
    expect(pet.achievements).toEqual(['first', 'lightning'])
    expect(pet.xp).toBe(2 + 15 + 15)
  })

  test('days in a row make a streak', async ($, on) => {
    const day = (offset: number) => {
      const d = new Date(NOW)
      d.setDate(d.getDate() - offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const days = Object.fromEntries([1, 2].map(i => [day(i), { turns: 3, tools: 5, focusMs: 0, costUsd: 0.5 }]))
    const w = world(on, { store: { stats: { days } } })
    await boot($, w)
    await turn($, w, 20_000, 1)
    expect(w.toasts.some(t => /Привычка/.test(t))).toBe(true)
    expect(await card($, w, 'overview', 'card-today')).toMatch(/✦ серия 3 дня/)
    expect(await card($, w, 'pet', 'card-tabby')).toMatch(/✦ серия: 3 дня подряд/)
  })
})

describe('empty session', () => {
  test('a session with no cost yet shows no 0¢', async ($, on) => {
    const w = world(on)
    w.isFresh = true
    await boot($, w)
    const session = await card($, w, 'overview', 'card-session')
    expect(session).toMatch(/СЕССИЯ\n1м 00с · 0 ходов · 0 инстр$/)
    expect(await pane($, w, 'overview')).not.toMatch(/¢/)
    const [row] = await band($, 140)
    expect(row).toMatch(/ctx —/)
    expect(row).not.toMatch(/¢|\$/)
  })
})

describe('pixels', () => {
  test('the band cat animates by repainting its cells, and rests once gone', async ($, on) => {
    const w = world(on)
    const blits: string[] = []
    let isMounted = true
    on('ui.blit', ($, e) => {
      blits.push(String(e.key))
      return { value: isMounted ? {} : { deny: 'not mounted' } }
    })
    await boot($, w)
    await $.turn.start({ text: 'go', turnId: 'anim' })
    const ui = await $.ui.mount({ surface: 'terminal', ...BAND(140, true) })
    await w.clock.advance(1200)
    expect(blits.length).toBeGreaterThan(2)
    expect(new Set(blits)).toEqual(new Set(['cat']))
    await ui.unmount()
    isMounted = false
    await w.clock.advance(500)
    const after = blits.length
    await w.clock.advance(3000)
    expect(blits.length).toBe(after)
  })

  test('the pane draws the big cat, the focus clock and the rings in cells', async ($, on) => {
    const w = world(on)
    await boot($, w)
    await command($, w, 'focus', 'Цель 25')
    await turn($, w, 5_000, 1)
    const kinds = async (tab: string, surface: 'terminal' | 'desktop') => {
      await command($, w, 'tab', tab)
      const ui = await $.ui.mount({ surface, ...PANE(96) })
      const keys = (await ui.findAll({ type: 'Raster' })).map(f => f.key)
      await ui.unmount()
      return keys
    }
    expect(await kinds('pet', 'terminal')).toEqual(['bigcat'])
    expect(await kinds('tasks', 'terminal')).toEqual(['focus-clock'])
    expect(await kinds('overview', 'terminal')).toEqual(['ring-context', 'ring-five_hour', 'ring-seven_day', 'heatmap'])
    for (const tab of ['pet', 'tasks', 'overview']) expect(await kinds(tab, 'desktop'), tab).toEqual([])
  })
})

describe('windows', () => {
  test('tests run through cmd.exe there', async ($, on) => {
    const w = world(on, { env: { OS: 'Windows_NT' } })
    await boot($, w)
    await command($, w, 'test')
    expect(w.ran.find(a => a[0] === 'cmd.exe')).toEqual(['cmd.exe', '/d', '/s', '/c', 'npm test'])
    expect(w.ran.some(a => a[0] === 'sh')).toBe(false)
  })
})

describe('settings', () => {
  test('English', { options: { language: 'en' } }, async ($, on) => {
    const w = world(on)
    await boot($, w)
    const [session, work] = await band($, 140)
    expect(session).toMatch(/ctx █+ 48% 96k\/200k {3,}5h █+ 23% ↻ 2h14m {3,}7d/)
    expect(work).toBe('⎇ feature/band ↑1 ✚2')
    expect(await pane($, w, 'overview')).toMatch(/1: Overview\s+2: Git ✚2\s+3: Tasks\s+4: Tests\s+5: Tabby[\s\S]*✓ all calm/)
    expect(await command($, w, 'focus', 'ship it 30')).toBe('◎ Focus: "ship it" · 30 min.')
  })

  test('quiet mode keeps only the critical toasts; sound off stays silent', { options: { quiet: true, sound: false } }, async ($, on) => {
    const w = world(on)
    await boot($, w)
    await turn($, w, 100_000, 1)
    expect(w.toasts).toEqual([])
    expect(w.sounds).toEqual([])
    w.usage.percent = 92
    await w.clock.advance(30_000)
    expect(w.toasts).toEqual(['Контекст заполнен на 90% — самое время для /compact'])
  })

  test('cost can be hidden; the pomodoro length is configurable', { options: { showCost: false, pomodoroMinutes: 50 } }, async ($, on) => {
    const w = world(on)
    await boot($, w)
    expect((await band($, 140))[0]).not.toMatch(/\$/)
    expect(await command($, w, 'focus', 'долгая задача')).toBe('◎ Фокус: «долгая задача» · 50 мин.')
  })

  test('the light palette swaps the colours', { options: { theme: 'light' } }, async ($, on) => {
    const w = world(on)
    await boot($, w)
    const ui = await $.ui.mount({ surface: 'terminal', ...BAND(140) })
    const found = await ui.findAll({ type: 'Text', text: '█' })
    expect(found.some(f => String(f.props.color).toLowerCase() === '#2e7d32')).toBe(true)
    expect(found.some(f => String(f.props.backgroundColor).toLowerCase() === '#d9dce3')).toBe(true)
    await ui.unmount()
  })
})
