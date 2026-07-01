import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { ICON_ALIASES } from '../packages/ui/layers/design-system/shared/icons/registry'
import { iconAliasMap, iconBundleList, iconMapFor, resolveUiIcon } from '../packages/ui/layers/design-system/shared/icons'

const require = createRequire(new URL('../packages/ui/package.json', import.meta.url))
const lucide = require('@iconify-json/lucide/icons.json') as { icons: Record<string, unknown> }

function lucideNameFromResolved(id: string) {
  return id.startsWith('i-lucide-') ? id.slice('i-lucide-'.length) : null
}

function lucideNameFromBundleEntry(id: string) {
  return id.startsWith('lucide:') ? id.slice('lucide:'.length) : null
}

describe('ui icon registry', () => {
  it('resolves semantic icon roles before rendering', () => {
    expect(resolveUiIcon('add')).toBe('i-lucide-plus')
    expect(resolveUiIcon('help')).toBe('i-lucide-circle-question-mark')
    expect(resolveUiIcon('i-lucide-radar')).toBe('i-lucide-radar')
    expect(resolveUiIcon('unknown-icon')).toBe('unknown-icon')
  })

  it('maps every active Lucide role to an installed icon', () => {
    for (const [role, id] of Object.entries(iconMapFor('lucide'))) {
      const name = lucideNameFromResolved(id)
      if (!name)
        continue

      expect(lucide.icons, `${role} -> ${id}`).toHaveProperty(name)
    }
  })

  it('bundles every active Lucide icon used by roles and aliases', () => {
    const bundle = new Set(iconBundleList('lucide'))

    for (const [role, id] of Object.entries(iconMapFor('lucide'))) {
      const name = lucideNameFromResolved(id)
      if (!name)
        continue

      expect(bundle, `${role} -> ${id}`).toContain(`lucide:${name}`)
    }

    for (const [alias, role] of Object.entries(ICON_ALIASES)) {
      const resolved = resolveUiIcon(role)
      const name = resolved ? lucideNameFromResolved(resolved) : null
      if (!name)
        continue

      expect(bundle, `${alias} -> ${role}`).toContain(`lucide:${name}`)
    }
  })

  it('keeps alias and client bundle Lucide names installable', () => {
    for (const [name, id] of Object.entries(iconAliasMap('lucide'))) {
      const icon = lucideNameFromBundleEntry(id)
      if (!icon)
        continue

      expect(lucide.icons, `${name} -> ${id}`).toHaveProperty(icon)
    }

    for (const id of iconBundleList('lucide')) {
      const icon = lucideNameFromBundleEntry(id)
      if (!icon)
        continue

      expect(lucide.icons, id).toHaveProperty(icon)
    }
  })
})
