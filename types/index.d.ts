export type TabRateLimit = {
  kind: string
  percent: number
  resetsAt?: string
}

export type TabUsage = {
  tokens?: number
  window: number
  percent?: number
  limits: TabRateLimit[]
  costUsd?: number
  startedAt: number
}

/** One reading of a rate limit, kept to see how fast it burns. */
export type TabLimitSample = { at: number; kind: string; percent: number; resetsAt?: string }

export type TabGitFile = { path: string; code: string }

export type TabGitCommit = { hash: string; subject: string; at: number }

export type TabPr = {
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  checks: { passed: number; failed: number; pending: number }
}

export type TabGit = {
  branch: string
  repo: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: number
  changed: number
  untracked: number
  conflicts: number
  stashes: number
  files: TabGitFile[]
  commits: TabGitCommit[]
  pr: TabPr | null
  at: number
}

export type TabTurn = {
  ms: number
  tools: number
  errors: number
  tokens: number
  /** the context fill once the turn ended, when known */
  context?: number
  costUsd?: number
  at: number
}

export type TabTurns = {
  count: number
  tools: number
  history: TabTurn[]
}

export type TabLive = {
  startedAt: number
  tools: number
  errors: number
  edits: number
  ranTests: boolean
  lastTool: string
  costAtStart?: number
}

export type TabTodo = {
  id: number
  text: string
  done: boolean
  by: 'user' | 'claude'
  isHigh?: boolean
  isGlobal?: boolean
}

/** Claude's own plan, as its TodoWrite tool keeps it. */
export type TabPlanItem = { text: string; active: string; status: 'pending' | 'in_progress' | 'completed' }

export type TabTestStatus = 'none' | 'running' | 'pass' | 'fail'

export type TabTestRun = { status: 'pass' | 'fail'; at: number; failed?: number }

export type TabTests = {
  status: TabTestStatus
  command: string | null
  passed?: number
  failed?: number
  total?: number
  ms?: number
  startedAt?: number
  at?: number
  tail: string
  failures: string[]
  history: TabTestRun[]
  by: 'button' | 'claude' | 'auto' | null
  previous: TabTestStatus
}

export type TabFocus = {
  goal: string
  startedAt: number
  minutes: number
  isNotified: boolean
}

export type TabPet = {
  name: string
  xp: number
  achievements: string[]
  lastUnlock: string | null
  lastUnlockAt: number
  totals: { turns: number; tools: number; todosDone: number }
}

export type TabDay = { turns: number; tools: number; focusMs: number; costUsd: number }

export type TabStats = { days: Record<string, TabDay> }

export type TabId = 'overview' | 'git' | 'tasks' | 'tests' | 'pet'

export type TabPrefs = {
  isCompact: boolean
  tab: TabId
  isPetShown: boolean
  /** sessions the intro hint has shown in; it stops after a few */
  introSeen: number
}

/** A two-step button waiting for its second press. */
export type TabConfirm = { key: string; until: number } | null

declare module 'claude-code' {
  interface PluginState {
    tabby: {
      usage: TabUsage | null
      samples: TabLimitSample[]
      git: TabGit | null
      turns: TabTurns
      live: TabLive | null
      todos: TabTodo[]
      plan: TabPlanItem[]
      tests: TabTests
      focus: TabFocus | null
      pet: TabPet
      stats: TabStats
      prefs: TabPrefs
      confirm: TabConfirm
      alerts: string[]
      tick: number
    }
  }
}
