// The slice of the engine the actions use. register.tsx builds it from `$`
// with each call spelled at its own site, so the actions stay `$`-free.
import type {
  ProcessRunInit,
  ProcessRunResult,
  SessionRepo,
  SessionUsage,
  Timer,
  ToastOptions,
  UiOpenResult,
} from 'claude-code'

import type {
  TabFocus,
  TabGit,
  TabLive,
  TabPet,
  TabPrefs,
  TabTests,
  TabTodo,
  TabTurns,
  TabUsage,
} from '../types'

export type Host = {
  now: () => Promise<number>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  usage: () => Promise<SessionUsage>
  root: () => Promise<string>
  repo: () => Promise<SessionRepo | null>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  exists: (path: string) => Promise<boolean>
  readFile: (path: string) => Promise<string>
  toast: (text: string, options?: ToastOptions) => void
  log: (text: string) => void
  after: (ms: number, fn: () => void) => Timer
  open: () => Promise<UiOpenResult>
  state: Cells
}

/** One value of the mod's state: read it, or change it from what it holds. */
export type Cell<T> = {
  get: () => Promise<T>
  set: (change: (value: T) => T) => Promise<T>
}

export type Cells = {
  usage: Cell<TabUsage | null>
  git: Cell<TabGit | null>
  turns: Cell<TabTurns>
  live: Cell<TabLive | null>
  todos: Cell<TabTodo[]>
  tests: Cell<TabTests>
  focus: Cell<TabFocus | null>
  pet: Cell<TabPet>
  prefs: Cell<TabPrefs>
  alerts: Cell<string[]>
  tick: Cell<number>
}
