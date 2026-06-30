import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

const APP_TITLE = 'Unlighthouse'

function normalizeTitle(title: string | null | undefined): string {
  const value = title?.trim()
  return value || APP_TITLE
}

export function formatTitleSite(value: string | null | undefined): string {
  const raw = value?.trim()
  if (!raw)
    return ''

  try {
    const url = new URL(raw)
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname.replace(/\/$/, '')
    return path && path !== '/' ? `${host}${path}` : host
  }
  catch (_err) {
    return raw.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

export function formatTitleRoutePath(value: string | null | undefined): string {
  const raw = value?.trim()
  if (!raw || raw === '/')
    return 'Homepage'

  try {
    return decodeURIComponent(raw)
  }
  catch (_err) {
    return raw
  }
}

export function usePageTitle(title?: MaybeRefOrGetter<string | null | undefined>) {
  const pageTitle = computed(() => normalizeTitle(title === undefined ? APP_TITLE : toValue(title)))
  const fullTitle = computed(() => pageTitle.value === APP_TITLE ? APP_TITLE : `${pageTitle.value} | ${APP_TITLE}`)

  useHead({
    title: pageTitle,
    titleTemplate: titleChunk => titleChunk && titleChunk !== APP_TITLE ? `${titleChunk} | ${APP_TITLE}` : APP_TITLE,
  })
  useSeoMeta({
    ogTitle: fullTitle,
    twitterTitle: fullTitle,
  })
}

export function useScanPageTitle(section: MaybeRefOrGetter<string | null | undefined>) {
  const route = useRoute()
  usePageTitle(computed(() => {
    const sectionTitle = normalizeTitle(toValue(section))
    const siteTitle = formatTitleSite(route.params.siteId as string | undefined)
    return siteTitle ? `${sectionTitle} - ${siteTitle}` : sectionTitle
  }))
}
