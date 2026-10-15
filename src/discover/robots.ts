interface Rule {
  allow: boolean
  pattern: string
  regex: RegExp
}

interface Group {
  agents: string[]
  rules: Rule[]
  crawlDelay: number | null
}

export interface Robots {
  allows(path: string): boolean
  crawlDelayMs: number | null
  sitemaps: string[]
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

export function parseRobots(text: string, userAgent = 'unlighthouse'): Robots {
  const groups: Group[] = []
  const sitemaps: string[] = []
  let current: Group | null = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const colon = line.indexOf(':')
    if (colon === -1)
      continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (key === 'sitemap') {
      if (value)
        sitemaps.push(value)
      continue
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current)
      continue
    if ((key === 'allow' || key === 'disallow') && value)
      current.rules.push({ allow: key === 'allow', pattern: value, regex: toRegex(value) })
    else if (key === 'crawl-delay' && Number.isFinite(Number(value)))
      current.crawlDelay = Number(value)
  }

  const ua = userAgent.toLowerCase()
  const specific = groups.filter(group => group.agents.some(agent => agent !== '*' && ua.includes(agent)))
  const chosen = specific.length ? specific : groups.filter(group => group.agents.includes('*'))
  const rules = chosen.flatMap(group => group.rules)
  const delays = chosen.map(group => group.crawlDelay).filter((delay): delay is number => delay !== null)

  return {
    sitemaps,
    crawlDelayMs: delays.length ? Math.max(...delays) * 1000 : null,
    allows(path) {
      let best: Rule | null = null
      for (const rule of rules) {
        if (!rule.regex.test(path))
          continue
        if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow))
          best = rule
      }
      return best ? best.allow : true
    },
  }
}
