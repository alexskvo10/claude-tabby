<div align="center">

<img src="docs/tabby.svg" width="160" alt="Tabby, a pixel-art cat">

# Tabby

**A calm dashboard above the Claude Code prompt — and a pixel cat who keeps you company.**

Context and rate limits with forecasts · git and PR checks · tests · focus timer · a TODO list Claude can read

<p>
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat-square">
  <img alt="Version 0.4.2" src="https://img.shields.io/badge/version-0.4.2-3B4252?style=flat-square">
  <img alt="72 tests" src="https://img.shields.io/badge/tests-72_passing-7FD4C1?style=flat-square">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-F4C7A1?style=flat-square">
</p>

**English** · [Русский](README.ru.md)

<img src="docs/band.svg" width="100%" alt="The Tabby band above the prompt: context, limits, the live turn, git, tests, the plan and focus">

</div>

> [!IMPORTANT]
> Tabby is built on Claude Code **function hooks**, which are in early access. It needs a Claude Code build **2.1.289 or newer** with function hooks enabled. On other builds the plugin will not load.

## Why Tabby

You shouldn't have to ask Claude Code how much room is left. Tabby keeps the numbers that matter in two quiet rows above the prompt: how full the context is, when your limits reset, whether the tests are green and what you set out to do. One look, then back to work.

- **All in one place.** Context, limits, git and PR checks, tests, Claude's plan, a focus timer, your TODO list and a pet, in one band and one pane. No status-line script, usage monitor or pet plugin to juggle.
- **Inside Claude Code, and alive.** Not a line of text: hover a block for its details, click it to open its tab, click a failing test to ask Claude to fix it.
- **Claude reads your list too.** It sees your focus goal and open tasks, adds and ticks items through its own tool, and the prompt cache stays warm.
- **It looks ahead.** How many turns the context has left at your pace, and whether a limit lasts until it resets.
- **The same limits in every chat.** A chat hears of your limits only with its own replies; Tabby shares the freshest reading, so a quiet chat never shows stale numbers.
- **Terminal and desktop app.** The same band and pane in both, with the cat in pixel art everywhere.
- **Nothing leaves your machine.** No dependencies and no network calls of its own beyond `gh`; [here is everything it touches](#what-tabby-does-on-your-machine).

## A look around

<table>
  <tr>
    <td width="33%"><img src="docs/overview.svg" alt="Overview tab: context and limit rings, today, the session"></td>
    <td width="33%"><img src="docs/tasks.svg" alt="Tasks tab: the focus clock, Claude's plan, your list"></td>
    <td width="33%"><img src="docs/pet.svg" alt="Tabby tab: the cat, its level and achievements"></td>
  </tr>
  <tr>
    <td align="center"><b>Overview</b><br><sub>context and limit rings, today, the session</sub></td>
    <td align="center"><b>Tasks</b><br><sub>focus clock, Claude's plan, your list</sub></td>
    <td align="center"><b>Tabby</b><br><sub>the cat, its level and achievements</sub></td>
  </tr>
</table>

<sub>The pictures are drawn from the same element trees the terminal gets; your font and spacing will differ a little.</sub>

## The band

In a terminal the blocks line up in columns, so the band reads like a small table; the desktop app draws it in a proportional font, with room between the blocks and the rows.

| Row | Blocks |
| --- | --- |
| **Session** | **Context**: a bar, the fill and how many turns are left at the current pace · **5h and 7d limits**: a bar and the time to reset · the session **cost** |
| **Work** | The **turn**: a live clock with the tool count, or how the last one went · **git**: branch, ahead/behind, changes, the PR and its CI checks · **tests** |
| **Tasks** | **Claude's plan** (its TodoWrite) · your **focus** timer · your **TODO** list |

- **Hover any block** for a card with the details, for example *Limit 5h: 50% · resets at 18:10 (in 1h 37m) · pace 12%/h · lasts until the reset*.
- **Click a label** to open its tab. Clicking `✗ 2 failed` drafts a request for Claude to fix exactly those tests; clicking `✓ 42/42` runs them again.
- **Colours** follow the fill: green, yellow from 60 %, red from 85 %.
- **Narrow window?** The least important blocks step aside first; rows never wrap. `/tab compact` folds the band into one row.
- **Every chat sees the same limits.** A chat hears of your limits only with its own replies, so Tabby shares the freshest reading between all your sessions.

Hover cards and clicks need mouse reporting: full-screen mode in a terminal, or the desktop app.

## The pane

Open it with `/tab` or the `≡` button. `1`–`5` switch tabs, `Esc` goes back to the prompt. Tabs carry badges for what needs you (`Git ✚2`, `Tests ✗`).

| Tab | What's inside |
| --- | --- |
| **Overview** | A "right now" line, the context ring with its forecast, limit rings with resets and pace, today with your streak and a four-week heat map, the session and its turns |
| **Git** | Branch, PR with checks and a link, changed files, a commit box (`Enter` stages everything and commits), stash with a second press to confirm, refresh |
| **Tasks** | A pomodoro with big pixel digits, Claude's plan step by step, your list: `!` important, `*` shared by all projects, click to tick, `c` clears done |
| **Tests** | A pass-rate ring, run history, the failing tests (click one to ask Claude to fix it), *fix all*, the tail of the output |
| **Tabby** | The big animated cat, level and XP, streak, achievements so far and what's next |

## Commands

| Command | What it does |
| --- | --- |
| `/tab [overview\|git\|tasks\|tests\|pet]` | Open the pane on a tab |
| `/tab compact` · `/tab hide-pet` | One-row band · hide the cat |
| `/focus <goal> [minutes]` | Start a pomodoro; `0` for no timer; `/focus stop` ends it |
| `/todo <text>` | Add a task: `/todo !urgent`, `/todo *in every project` |
| `/todo done N` · `/todo rm N` | Tick · remove |
| `/test [command]` | Run the tests; the command is detected, and one you give is remembered for the project |

They all work while Claude is answering.

## Settings

`/config` → **tabby**

| Setting | Default | What it changes |
| --- | --- | --- |
| Language | `en` | `en` or `ru` |
| Animate Tabby | on | The pixel cat's animation |
| Palette | `dark` | Colours for a dark or a light terminal |
| Pomodoro minutes | 25 | Length of a focus session |
| Context warning, % | 80 | When to warn about the context |
| Rate-limit warning, % | 80 | When to warn about the limits |
| Run tests after Claude edits | off | After a turn that edited files and ran no tests, run them |
| Sound | on | A soft chime when a long turn or a pomodoro ends |
| Quiet mode | off | Only the important toasts |
| Show cost | on | Show the session cost |

## Tabby the cat

Tabby's mood follows the session. It purrs with its eyes shut in a smile (a heart now and then), peeks over a laptop and types while Claude works, looks sad at red tests, focuses with you, falls asleep after 15 idle minutes and beams at a new achievement. It earns XP for turns, green tests, finished tasks, pomodoros and 17 achievements. Its progress, your daily stats and your streak are kept between sessions.

In terminals it is drawn in half blocks (`▀`), two square pixels per cell, in any truecolor terminal including Windows Terminal; only the cat's cells repaint, about eight times a second, and only while it is on screen. The desktop app, VS Code and the phone get the same pictures as SVG.

## What Claude sees

- **The `mcp__tabby__todo` tool.** Claude can read your list, add items (important ones too, or ones shared by all projects) and tick them off. Its items are marked `✦`.
- **Your focus goal and open tasks**, attached briefly to your message only when they change. The system prompt is untouched, so the prompt cache stays warm.
- **Tests Claude runs itself.** When Claude runs tests through Bash, the result shows in the band too. After `git push` or `gh pr`, the PR status refreshes at once.

## What Tabby does on your machine

Tabby runs code inside your Claude Code session, so here is everything it touches:

- **Runs** `git` (status, log, commit, stash), `gh` (PR and checks, if installed and signed in) and your project's test command.
- **Commits from the pane with the repository's git hooks off**, because that is how the engine runs git. Pre-commit checks will not run for those commits.
- **Writes** its own store (progress, stats, settings, your list) in the Claude Code configuration directory, and `~/.claude/tabby-limits.json`, the limit reading it shares between your chats.
- **Sends nothing anywhere.** No network calls of its own beyond `gh`.

## Install

**As a plugin**

```bash
claude plugin marketplace add alexskvo10/claude-tabby
claude plugin install tabby@tabby
```

**From a folder**

```bash
git clone https://github.com/alexskvo10/claude-tabby ~/claude-tabby
claude --plugin-dir ~/claude-tabby
```

To load it every time, add this to `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/full/path/to/claude-tabby" } }
```

Update with `git pull` in the folder, then restart `claude`. In the desktop app, quit it fully (tray icon included) so it reads the new code.

PR status and checks need the [`gh`](https://cli.github.com) CLI, installed and signed in. Without it the Git tab still works, just without the PR.

## Development

```bash
claude plugin validate .   # the manifest and the hooks module, as the engine sees them
claude plugin test .       # 72 tests: helpers, the band, the pane, commands, settings
tsc -p .                   # after a first load the engine puts its types in .claude-plugin/types/
```

```
hooks/register.tsx   hooks, commands, the tool, settings; the only place that touches `$`
hooks/actions.ts     the logic: limits, turns, git and PRs, tests, tasks, focus, the cat, stats
hooks/ui/            the band (with its cards) and the pane: pure functions of a state snapshot
hooks/lib/           formatting, forecasts, git, tests, stats, i18n (en/ru),
                     pixels.ts (half blocks, rings, digits), sprites.ts (the cat), anim.ts (frames)
assets/chime.wav     the chime
types/index.d.ts     the state contract ($.state)
tests/               tests for `claude plugin test`
```

## License

[MIT](LICENSE). Tabby is an independent community plugin. It is not made, endorsed or supported by Anthropic.
