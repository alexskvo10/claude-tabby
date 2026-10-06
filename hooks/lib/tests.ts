// Finding, recognising and reading test runs. Pure: the file probes come in.

/** A Bash command that runs a test suite. */
export const TEST_COMMAND =
  /(^|[\s;&|(])((npm|pnpm|yarn|bun)\s+(run\s+)?test|bun\s+test|npx\s+(jest|vitest)|jest|vitest(\s+run)?|pytest|python3?\s+-m\s+(pytest|unittest)|cargo\s+(test|nextest)|go\s+test|make\s+(test|check)|deno\s+test|mix\s+test|rspec|phpunit|dotnet\s+test|\.?\/?gradlew?\s+test|mvnw?\s+test)(?=$|[\s;&|)])/

export function isTestCommand(command: string): boolean {
  return TEST_COMMAND.test(command)
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '')
}

export type TestSummary = { passed?: number; failed?: number; total?: number }

function count(line: string, word: RegExp): number | undefined {
  const match = new RegExp(`(\\d+) ${word.source}`).exec(line)
  return match ? Number(match[1]) : undefined
}

function withTotal(s: TestSummary): TestSummary {
  if (s.total === undefined && (s.passed !== undefined || s.failed !== undefined)) {
    return { ...s, total: (s.passed ?? 0) + (s.failed ?? 0) }
  }
  return s
}

/** Reads the counts out of a runner's output, as far as it can tell. */
export function parseSummary(raw: string): TestSummary {
  const text = stripAnsi(raw)

  // cargo: one "test result" line per test binary
  const cargo = [...text.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)]
  if (cargo.length > 0) {
    let passed = 0
    let failed = 0
    for (const m of cargo) {
      passed += Number(m[1])
      failed += Number(m[2])
    }
    return { passed, failed, total: passed + failed }
  }

  // jest: "Tests:       1 failed, 41 passed, 42 total"
  const jest = /^\s*Tests:\s+(.*\d+ total.*)$/m.exec(text)
  if (jest) {
    const line = jest[1]!
    return withTotal({ passed: count(line, /passed/) ?? 0, failed: count(line, /failed/) ?? 0, total: count(line, /total/) })
  }

  // vitest: "Tests  2 failed | 40 passed (42)"
  const vitest = /^\s*Tests\s+(.*\(\d+\).*)$/m.exec(text)
  if (vitest) {
    const line = vitest[1]!
    const total = /\((\d+)\)/.exec(line)
    return { passed: count(line, /passed/) ?? 0, failed: count(line, /failed/) ?? 0, total: total ? Number(total[1]) : undefined }
  }

  // pytest: "===== 2 failed, 40 passed in 1.23s ====="
  const pytest = [...text.matchAll(/^=+ (.*\b(?:passed|failed|errors?|no tests ran)\b.*) in [\d.]+s.*=+\s*$/gm)].at(-1)
  if (pytest) {
    const line = pytest[1]!
    const failed = (count(line, /failed/) ?? 0) + (count(line, /errors?/) ?? 0)
    return withTotal({ passed: count(line, /passed/) ?? 0, failed })
  }

  // bun test: " 41 pass\n 1 fail"
  const bunPass = /^\s*(\d+) pass$/m.exec(text)
  const bunFail = /^\s*(\d+) fail$/m.exec(text)
  if (bunPass || bunFail) {
    return withTotal({ passed: bunPass ? Number(bunPass[1]) : 0, failed: bunFail ? Number(bunFail[1]) : 0 })
  }

  // go test: per-package "ok" / "FAIL" lines
  const goOk = text.match(/^ok\s+\S+/gm)?.length ?? 0
  const goFail = text.match(/^FAIL\s+\S+/gm)?.length ?? 0
  if (goOk + goFail > 0) return { passed: goOk, failed: goFail, total: goOk + goFail }

  // anything that prints "N passed" / "N failed"
  const passed = count(text, /passed/)
  const failed = count(text, /failed/)
  if (passed !== undefined || failed !== undefined) return withTotal({ passed, failed })

  return {}
}

/** Names of the failing tests, as each runner prints them; at most `max`. */
export function parseFailures(raw: string, max = 20): string[] {
  const text = stripAnsi(raw)
  const found: string[] = []
  const add = (name: string | undefined) => {
    const clean = name?.trim().replace(/\s+/g, ' ')
    if (clean && !found.includes(clean)) found.push(clean)
  }
  const patterns = [
    /^\s*(?:FAIL|×|✗)\s+(\S+\.\w+\s+>\s+.+?)(?:\s+\d+ms)?$/gm, // vitest
    /^\s+[✕×]\s+(.+?)(?:\s+\(\d+\s*ms\))?$/gm, // jest
    /^FAILED\s+(\S+::\S+)/gm, // pytest
    /^test\s+(\S+)\s+\.\.\.\s+FAILED$/gm, // cargo
    /^\s*--- FAIL:\s+(\S+)/gm, // go
    /^\s*\(fail\)\s+(.+?)(?:\s+\[[\d.]+ms\])?$/gm, // bun
  ]
  for (const re of patterns) for (const m of text.matchAll(re)) add(m[1])
  return found.slice(0, max)
}

/** The last lines of output, for the pane. */
export function tail(raw: string, lines: number): string {
  const all = stripAnsi(raw).replace(/\s+$/, '').split('\n')
  return all.slice(-lines).join('\n')
}

export type Probe = {
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string | undefined>
}

/** The project's own test command, guessed from what lies in its root. */
export async function detectCommand(probe: Probe): Promise<string | null> {
  const pkg = await probe.read('package.json')
  if (pkg !== undefined) {
    try {
      const parsed = JSON.parse(pkg) as { scripts?: Record<string, unknown> }
      const script = parsed.scripts?.test
      if (typeof script === 'string' && !/no test specified/.test(script)) {
        if ((await probe.exists('bun.lockb')) || (await probe.exists('bun.lock'))) return 'bun run test'
        if (await probe.exists('pnpm-lock.yaml')) return 'pnpm test'
        if (await probe.exists('yarn.lock')) return 'yarn test'
        return 'npm test'
      }
    } catch {
      // a package.json that does not parse names no command
    }
  }
  if (await probe.exists('Cargo.toml')) return 'cargo test'
  if (await probe.exists('go.mod')) return 'go test ./...'
  if (
    (await probe.exists('pytest.ini')) ||
    (await probe.exists('pyproject.toml')) ||
    (await probe.exists('setup.cfg')) ||
    (await probe.exists('tox.ini'))
  ) {
    return 'python -m pytest -q'
  }
  if ((await probe.exists('deno.json')) || (await probe.exists('deno.jsonc'))) return 'deno test'
  if (await probe.exists('mix.exs')) return 'mix test'
  const makefile = await probe.read('Makefile')
  if (makefile !== undefined && /^test\s*:/m.test(makefile)) return 'make test'
  return null
}
