import type { TabPrefs, TabTests, TabTurns } from '../types'

export const PANE = 'tabby'

export const NO_TESTS: TabTests = {
  status: 'none',
  command: null,
  tail: '',
  by: null,
  previous: 'none',
}

export const NO_TURNS: TabTurns = { count: 0, tools: 0, history: [] }

export const DEFAULT_PREFS: TabPrefs = { isCompact: false, tab: 'overview', isPetShown: true }
