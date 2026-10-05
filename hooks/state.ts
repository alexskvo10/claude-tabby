import type { TabPrefs, TabStats, TabTests, TabTurns } from '../types'

export const PANE = 'tabby'

export const NO_TESTS: TabTests = {
  status: 'none',
  command: null,
  tail: '',
  failures: [],
  history: [],
  by: null,
  previous: 'none',
}

export const NO_TURNS: TabTurns = { count: 0, tools: 0, history: [] }

export const NO_STATS: TabStats = { days: {} }

export const DEFAULT_PREFS: TabPrefs = { isCompact: false, tab: 'overview', isPetShown: true, introSeen: 0 }

/** What /config holds for the mod (the manifest's userConfig). */
export type Options = {
  language: 'ru' | 'en'
  theme: 'dark' | 'light'
  pomodoroMinutes: number
  warnContext: number
  warnLimit: number
  autoTests: boolean
  sound: boolean
  quiet: boolean
  showCost: boolean
  animate: boolean
}

export const DEFAULT_OPTIONS: Options = {
  language: 'ru',
  theme: 'dark',
  pomodoroMinutes: 25,
  warnContext: 80,
  warnLimit: 80,
  autoTests: false,
  sound: true,
  quiet: false,
  showCost: true,
  animate: true,
}

/** Reads the options the engine hands `register`, falling back field by field. */
export function readOptions(raw: Readonly<Record<string, unknown>> | undefined): Options {
  const o = raw ?? {}
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    language: o.language === 'en' ? 'en' : 'ru',
    theme: o.theme === 'light' ? 'light' : 'dark',
    pomodoroMinutes: num(o.pomodoroMinutes, 25, 1, 180),
    warnContext: num(o.warnContext, 80, 50, 99),
    warnLimit: num(o.warnLimit, 80, 50, 99),
    autoTests: bool(o.autoTests, false),
    sound: bool(o.sound, true),
    quiet: bool(o.quiet, false),
    showCost: bool(o.showCost, true),
    animate: bool(o.animate, true),
  }
}
