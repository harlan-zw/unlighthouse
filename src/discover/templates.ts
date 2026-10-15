interface Node {
  children: Map<string, Node>
  paths: string[]
}

const GROUP_MIN = 4

const DYNAMIC_SEGMENT = [
  /^\d+$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[0-9a-f]{12,}$/i,
  /^\d{4}-\d{2}(?:-\d{2})?$/,
  /^[a-z0-9]+(?:-[a-z0-9]+){3,}$/i,
]

function isDynamic(segment: string): boolean {
  return DYNAMIC_SEGMENT.some(pattern => pattern.test(segment))
}

export function segmentsOf(path: string): string[] {
  return path.split('?')[0]!.split('/').filter(Boolean)
}

function newNode(): Node {
  return { children: new Map(), paths: [] }
}

function mergeInto(target: Node, source: Node): void {
  target.paths.push(...source.paths)
  for (const [key, child] of source.children) {
    const existing = target.children.get(key)
    if (existing)
      mergeInto(existing, child)
    else
      target.children.set(key, child)
  }
}

function shape(node: Node): string {
  if (!node.children.size)
    return '.'
  return `(${[...node.children.entries()].map(([key, child]) => `${key}${shape(child)}`).sort().join(',')})`
}

function collapse(node: Node, depth: number): void {
  for (const child of node.children.values())
    collapse(child, depth + 1)

  const groups = new Map<string, string[]>()
  for (const [key, child] of node.children) {
    if (key === '*')
      continue
    const signature = shape(child)
    groups.set(signature, [...(groups.get(signature) ?? []), key])
  }

  for (const [signature, keys] of groups) {
    const dynamicKeys = keys.filter(isDynamic)
    const bigGroup = keys.length >= GROUP_MIN && (depth > 0 || signature !== '.')
    const toMerge = bigGroup ? keys : dynamicKeys
    if (!toMerge.length)
      continue
    const wildcard = node.children.get('*') ?? newNode()
    for (const key of toMerge) {
      mergeInto(wildcard, node.children.get(key)!)
      node.children.delete(key)
    }
    node.children.set('*', wildcard)
  }

  const wildcard = node.children.get('*')
  if (wildcard)
    collapse(wildcard, depth + 1)
}

function assign(node: Node, prefix: string, out: Map<string, string>): void {
  for (const path of node.paths)
    out.set(path, prefix || '/')
  for (const [key, child] of node.children)
    assign(child, `${prefix}/${key}`, out)
}

export function compileTemplate(pattern: string): (segments: string[]) => boolean {
  const parts = segmentsOf(pattern)
  return (segments) => {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      if (part === '**')
        return true
      if (i >= segments.length)
        return false
      if (part !== '*' && !part.startsWith(':') && part !== segments[i])
        return false
    }
    return parts.length === segments.length
  }
}

export function inferTemplates(paths: readonly string[], known: readonly string[] = []): Map<string, string> {
  const out = new Map<string, string>()
  const matchers = known.map(pattern => ({ pattern, match: compileTemplate(pattern) }))
  const root = newNode()

  for (const path of paths) {
    const segments = segmentsOf(path)
    const hit = matchers.find(matcher => matcher.match(segments))
    if (hit) {
      out.set(path, hit.pattern)
      continue
    }
    let node = root
    for (const segment of segments) {
      let child = node.children.get(segment)
      if (!child) {
        child = newNode()
        node.children.set(segment, child)
      }
      node = child
    }
    node.paths.push(path)
  }

  collapse(root, 0)
  assign(root, '', out)
  return out
}

export function sampleByTemplate<T extends { template: string }>(items: readonly T[], perTemplate: number, max: number): { picked: T[], skipped: T[] } {
  const counts = new Map<string, number>()
  const picked: T[] = []
  const skipped: T[] = []
  for (const item of items) {
    const count = counts.get(item.template) ?? 0
    if ((perTemplate === 0 || count < perTemplate) && picked.length < max) {
      picked.push(item)
      counts.set(item.template, count + 1)
    }
    else {
      skipped.push(item)
    }
  }
  return { picked, skipped }
}
