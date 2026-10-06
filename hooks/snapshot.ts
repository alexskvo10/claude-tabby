// Every value the drawings read, read at once by the render hooks.
import type {
  TabConfirm,
  TabFocus,
  TabGit,
  TabId,
  TabLimitSample,
  TabLive,
  TabPet,
  TabPlanItem,
  TabPrefs,
  TabStats,
  TabTests,
  TabTodo,
  TabTurns,
  TabUsage,
} from '../types'

export type Snapshot = {
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
  now: number
  showCost: boolean
  autoTests: boolean
  pomodoroMinutes: number
  /** the terminal draws pictures (kitty graphics) */
  canImage: boolean
  /** Tabby moves (the Animate Tabby setting) */
  animate: boolean
}

/** What a press in a drawing may ask for; does nothing until the session starts. */
export type Handlers = {
  open: (tab?: TabId) => void
  setTab: (tab: TabId) => void
  runTests: () => void
  askToFix: (names?: readonly string[]) => void
  refreshGit: () => void
  commit: (message: string) => void
  stash: () => void
  addTodo: (text: string) => void
  toggleTodo: (id: number) => void
  clearDone: () => void
  startFocus: (goal: string) => void
  stopFocus: () => void
  togglePet: () => void
}
