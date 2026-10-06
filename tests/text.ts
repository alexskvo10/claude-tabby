// Flattens a drawn tree to plain lines, roughly as the terminal lays it out:
// enough to look at a drawing and to assert on what a row says.
type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] } | string | null | undefined

function width(s: string): number {
  return Array.from(s).length
}

function textOf(node: Node): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  return (node.children ?? []).map(c => textOf(c as Node)).join('')
}

export function lines(node: Node): string[] {
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  const p = node.props ?? {}
  const kids = (node.children ?? []).filter(c => c !== null && c !== undefined && c !== false) as Node[]
  let out: string[]
  if (node.type === 'Text') out = textOf(node).split('\n')
  else if (node.type === 'Button') {
    const label = String(p.label ?? textOf(node))
    out = [p.plain ? (p.hotkey ? `${String(p.hotkey)}: ${label}` : label) : `[ ${label} ]`]
  } else if (node.type === 'Link') out = [String(p.label ?? p.href ?? '')]
  else if (node.type === 'Input') out = [`${String(p.label ?? '')}${String(p.value || p.placeholder || '')}`]
  else if (node.type === 'Box') {
    if (p.display === 'none') return []
    const parts = kids.map(k => lines(k))
    if ((p.flexDirection ?? 'row') === 'row') {
      const gap = ' '.repeat(Number(p.columnGap ?? p.gap ?? 0))
      const h = Math.max(0, ...parts.map(x => x.length))
      const widths = parts.map(x => Math.max(0, ...x.map(width)))
      out = []
      for (let i = 0; i < h; i += 1) {
        out.push(parts.map((x, j) => (x[i] ?? '').padEnd(widths[j]!)).join(gap).replace(/\s+$/, ''))
      }
      if (p.justifyContent === 'space-between' && typeof p.width === 'number' && parts.length === 2 && out.length === 1) {
        const a = parts[0]![0] ?? ''
        const b = parts[1]![0] ?? ''
        out = [a + ' '.repeat(Math.max(1, Number(p.width) - width(a) - width(b))) + b]
      }
    } else out = parts.flat()
    const top = Number(p.marginTop ?? p.marginY ?? 0)
    out = [...Array(top).fill(''), ...out]
  } else out = [textOf(node)]
  return out
}

export function show(title: string, node: unknown): string {
  const body = lines(node as Node)
  const w = Math.max(title.length, ...body.map(width))
  return [`┌─ ${title} ${'─'.repeat(Math.max(0, w - title.length - 1))}┐`, ...body.map(l => `│${l.padEnd(w + 2)}│`), `└${'─'.repeat(w + 2)}┘`].join('\n')
}
