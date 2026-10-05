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

export type TabGitFile = { path: string; code: string }

export type TabGitCommit = { hash: string; subject: string; at: number }

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
  files: TabGitFile[]
  commits: TabGitCommit[]
  at: number
}

export type TabTurn = {
  ms: number
  tools: number
  errors: number
  tokens: number
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
  lastTool: string
}

export type TabTodo = {
  id: number
  text: string
  done: boolean
  by: 'user' | 'claude'
}

export type TabTestStatus = 'none' | 'running' | 'pass' | 'fail'

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
  by: 'button' | 'claude' | null
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

export type TabId = 'overview' | 'git' | 'tasks' | 'tests' | 'pet'

export type TabPrefs = {
  isCompact: boolean
  tab: TabId
  isPetShown: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'tabby': {
      usage: TabUsage | null
      git: TabGit | null
      turns: TabTurns
      live: TabLive | null
      todos: TabTodo[]
      tests: TabTests
      focus: TabFocus | null
      pet: TabPet
      prefs: TabPrefs
      alerts: string[]
      tick: number
    }
  }
}
