import type { TabGit, TabGitCommit, TabGitFile } from '../../types'

export type GitStatus = Omit<TabGit, 'repo' | 'commits' | 'at' | 'stashes' | 'pr'>

const MAX_FILES = 200

/** Parses `git status --porcelain=v2 --branch` (newline separated). */
export function parseStatus(text: string): GitStatus {
  let branch = ''
  let oid = ''
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  let staged = 0
  let changed = 0
  let untracked = 0
  let conflicts = 0
  const files: TabGitFile[] = []

  for (const line of text.split('\n')) {
    if (line === '') continue
    if (line.startsWith('# branch.oid ')) {
      oid = line.slice('# branch.oid '.length)
    } else if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length)
    } else if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(line)
      if (match) {
        ahead = Number(match[1])
        behind = Number(match[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const fields = line.split(' ')
      const xy = fields[1] ?? '..'
      const x = xy[0] ?? '.'
      const y = xy[1] ?? '.'
      const rest = fields.slice(line.startsWith('1 ') ? 8 : 9).join(' ')
      const path = rest.split('\t')[0] ?? rest
      if (x !== '.') staged += 1
      if (y !== '.') changed += 1
      files.push({ path, code: y !== '.' ? y : x })
    } else if (line.startsWith('u ')) {
      conflicts += 1
      files.push({ path: line.split(' ').slice(10).join(' '), code: 'U' })
    } else if (line.startsWith('? ')) {
      untracked += 1
      files.push({ path: line.slice(2), code: '?' })
    }
  }

  if (branch === '(detached)') branch = oid === '' ? 'detached' : `@${oid.slice(0, 7)}`

  return {
    branch,
    upstream,
    ahead,
    behind,
    staged,
    changed,
    untracked,
    conflicts,
    files: files.slice(0, MAX_FILES),
  }
}

/** Parses `git log --pretty=format:%h%x1f%ct%x1f%s`. */
export function parseLog(text: string): TabGitCommit[] {
  const commits: TabGitCommit[] = []
  for (const line of text.split('\n')) {
    const [hash, ct, ...subject] = line.split('\x1f')
    if (!hash || !ct) continue
    commits.push({ hash, at: Number(ct) * 1000, subject: subject.join('\x1f') })
  }
  return commits
}

/** `owner/name` from a remote URL (ssh or https), or null. */
export function repoName(remote: string | null | undefined): string | null {
  if (!remote) return null
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remote.trim())
  return match ? `${match[1]}/${match[2]}` : null
}

/** A colour per porcelain code. */
export function fileTone(code: string): 'green' | 'yellow' | 'red' | 'blue' | 'dim' {
  if (code === 'A') return 'green'
  if (code === 'D' || code === 'U') return 'red'
  if (code === 'R' || code === 'C') return 'blue'
  if (code === '?') return 'dim'
  return 'yellow'
}
