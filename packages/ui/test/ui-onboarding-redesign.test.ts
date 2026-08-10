import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), 'utf8')
}

describe('onboarding redesign', () => {
  it('uses a focused layout with the logo above the scan card', async () => {
    const [page, layout] = await Promise.all([
      source('app/pages/onboarding.vue'),
      source('app/layouts/onboarding.vue'),
    ])

    expect(page).toContain('layout: \'onboarding\'')
    expect(page).toContain('src="/logo.png"')
    expect(page).not.toContain('src="/logo-full.png"')
    expect(page.indexOf('src="/logo.png"')).toBeLessThan(page.indexOf('<NewScanForm'))
    expect(page).toContain('aria-hidden="true"')
    expect(page).toContain('Unlighthouse')
    expect(page).toContain('unlighthouseVersion')
    expect(page).toContain('<UiChip purpose="count" size="sm" mono>')
    expect(page).toContain('href="https://github.com/harlan-zw/unlighthouse"')
    expect(page).toContain('aria-label="Unlighthouse on GitHub"')
    expect(page).toContain('items-center justify-center gap-3')
    expect(page).toContain('class="flex justify-center pt-1"')
    expect(page.indexOf('<NewScanForm')).toBeLessThan(page.indexOf('href="https://github.com/harlan-zw/unlighthouse"'))
    expect(page).not.toContain('Run your first audit')
    expect(page).toContain('<NewScanForm hide-cancel emphasis focused />')
    expect(layout).toContain('<main')
    expect(layout).toContain('<UiAtmosphere preset="front-door" palette="blue"')
    expect(layout).not.toContain('SidebarShell')
  })

  it('ports the canonical atmosphere primitive and front-door tokens', async () => {
    const [component, css] = await Promise.all([
      source('layers/design-system/app/components/element/UiAtmosphere.vue'),
      source('layers/design-system/css/global.css'),
    ])

    expect(component).toContain('type Preset = \'front-door\'')
    expect(component).toContain('type Palette = \'ink\' | \'blue\'')
    expect(component).toContain('\'front-door\': { palette: \'twilight\', geometry: \'bloom\', intensity: \'present\' }')
    expect(component).toContain('aria-hidden="true"')
    expect(css).toContain('--greydient-twilight:')
    expect(css).toContain('--greydient-blue:')
    expect(css).toContain('.ui-atmosphere[data-geometry="bloom"]')
    expect(css).toContain('.dark .ui-atmosphere[data-intensity="present"]')
  })

  it('offers top-level outcome-led scan tabs while preserving the full-site default', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('const scanMode = ref<\'site\' | \'page\'>(\'site\')')
    expect(form).toContain('label: \'Whole site\'')
    expect(form).toContain('label: \'One page\'')
    expect(form).toContain('<UTabs')
    expect(form).toContain('variant="link"')
    expect(form).toContain(':content="false"')
    expect(form).toContain('list: \'w-full justify-start gap-8 border-0 bg-transparent p-0\'')
    expect(form.indexOf('<UTabs')).toBeLessThan(form.indexOf('<UiCard'))
    expect(form).toContain('Checking site scope')
    expect(form).not.toContain('name="scan-mode"')
  })

  it('keeps scope preview advisory and stale requests isolated', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('api[\'scan.preview\']')
    expect(form).toContain('previewRequestId')
    expect(form).toContain('Estimate unavailable')
    expect(form).toContain('Scan settings still work')
    expect(form).toContain('estimateScanDuration')
    expect(form).toContain('Rate limit detected')
    expect(form).toContain('Cloudflare protection detected')
    expect(form).toContain('Cloudflare trap links ignored')
  })

  it('starts whole-site discovery only after the URL input blurs', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('async function handleSiteUrlBlur')
    expect(form).toContain('@blur="handleSiteUrlBlur"')
    expect(form).toContain('const scopeChecking = computed(() => preview.value._tag === \'Checking\')')
    expect(form).not.toContain('watchDebounced')
    expect(form).not.toContain('immediate: Boolean(props.initialUrl)')
  })

  it('keeps whole-site submission disabled until scope discovery settles', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('const previewFinished = computed')
    expect(form).toContain('const canRunScan = computed')
    expect(form).toContain('scanMode.value === \'page\' || previewFinished.value')
    expect(form).toContain(':disabled="!canRunScan"')
    expect(form).toContain('Checking site scope…')
  })

  it('recommends an editable 100 page limit without overwriting user intent', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('recommendPageLimit')
    expect(form).toContain('RECOMMENDED_PAGE_LIMIT')
    expect(form).toContain('<UInputNumber')
    expect(form).toContain('name="max-routes"')
    expect(form).toContain(':step-snapping="false"')
    expect(form).toContain('_tag: \'User\'')
    expect(form).toContain('maxRoutes: scanMode.value === \'site\'')
    expect(form).toContain('Limited to 100 pages')
  })

  it('places a stylized estimate at the bottom of the card', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('class="scan-estimate-summary')
    expect(form).toContain('<UiIcon name="timer"')
    expect(form.indexOf('class="scan-estimate-summary')).toBeGreaterThan(form.indexOf('id="scan-advanced-options"'))
    expect(form.indexOf('class="scan-estimate-summary')).toBeLessThan(form.indexOf('type="submit"'))
  })

  it('omits scan estimates for the one-page scope', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    expect(form).toContain('if (scanMode.value === \'page\' || !effectiveUrlCount.value)')
  })

  it('uses a compact accessible icon toggle for device profiles', async () => {
    const [form, css] = await Promise.all([
      source('app/features/scan/components/NewScanForm.vue'),
      source('app/assets/css/accessibility.css'),
    ])

    expect(form).toContain('<UiTogglePill')
    expect(form).toContain('label="Audit device"')
    expect(form).toContain('class="scan-device-toggle w-fit max-w-full"')
    expect(form).toContain('icon: \'smartphone\'')
    expect(form).toContain('icon: \'monitor\'')
    expect(form).not.toMatch(/<USelect[\s\S]{0,220}name="device"/)
    expect(css).toContain('flex: 0 0 auto')
  })

  it('gives every Lighthouse category a suitable icon and selected state', async () => {
    const form = await source('app/features/scan/components/NewScanForm.vue')

    for (const icon of ['gauge', 'accessibility', 'search', 'shield-check', 'bot'])
      expect(form).toContain(`icon: '${icon}'`)
    expect(form).toContain('<UiIcon :name="cat.icon"')
    expect(form).toContain('peer-checked:')
  })

  it('keeps validation, loading, failure, and reduced-motion states explicit', async () => {
    const [form, css] = await Promise.all([
      source('app/features/scan/components/NewScanForm.vue'),
      source('app/assets/css/accessibility.css'),
    ])

    expect(form).toContain('loading ? \'Starting scan…\' : scopeChecking ? \'Checking site scope…\' : \'Run scan\'')
    expect(form).toContain(':aria-busy="loading || scopeChecking"')
    expect(form).toContain('class="min-h-11! lg:min-h-11!"')
    expect(form).not.toContain('icon="radar"')
    expect(form).toContain('<UiAlert')
    expect(form).toContain('Scan could not start')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.ui-motion-button__leading .animate-spin')
  })
})
