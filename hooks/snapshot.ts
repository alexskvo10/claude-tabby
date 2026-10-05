// Every value the drawings read, read at once by the render hooks.
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

export type Snapshot = {
  usage: TabUsage | null
  git: TabGit | null
  turns: TabTurns
  live: TabLive | null
  todos: TabTodo[]
  tests: TabTests
  focus: TabFocus | null
  pet: TabPet
  prefs: TabPrefs
  now: number
}
