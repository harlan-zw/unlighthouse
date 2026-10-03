import type { ShjThemePair, ShjToken } from 'rangi'
import { tokenize } from 'rangi'
import { githubDark, githubLight } from 'rangi/themes'

// @harlan-zw/comark-content also exports `contentRangiTheme`, but only from its
// build-time module entry, which pulls `@nuxt/kit` and `node:` builtins. This
// file is imported by Vue components (`ModuleInstall`, `SiteConfigQuickSetup`,
// the docs nav) and by `shared/markdown.ts`, so it must stay client-safe. The
// two definitions are identical apart from the theme name; keep them in step.
export const contentRangiTheme: ShjThemePair = {
  light: {
    ...githubLight,
    name: 'nuxtseo-github-light-aa',
    tokens: { ...githubLight.tokens, cmnt: '#57606a' },
  },
  dark: githubDark,
}

export interface HighlightedCode {
  className: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function tokenStyle(token: ShjToken, appearance: 'adaptive' | 'dark'): string {
  const light = contentRangiTheme.light.tokens[token]
  const dark = contentRangiTheme.dark.tokens[token]
  const color = appearance === 'dark'
    ? dark
    : light && dark && light !== dark ? `light-dark(${light},${dark})` : light ?? dark
  return [color ? `color:${color}` : '', token === 'cmnt' ? 'font-style:italic' : ''].filter(Boolean).join(';')
}

export function highlightCode(code: string, lang: string, appearance: 'adaptive' | 'dark' = 'adaptive'): HighlightedCode {
  const requestedLanguage = lang.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'plain'
  const language = requestedLanguage === 'dotenv' || requestedLanguage === 'env' ? 'ini' : requestedLanguage
  const html = tokenize(code, { lang: language }).map((token) => {
    const value = escapeHtml(token.text)
    if (!token.type)
      return value
    const style = tokenStyle(token.type, appearance)
    return style ? `<span style="${style}">${value}</span>` : value
  }).join('')

  return {
    html,
    className: `rangi shj-lang-${requestedLanguage}`,
  }
}

export function inlineHighlightedCode(code: string, lang: string): string {
  const highlighted = highlightCode(code, lang)
  return `<code class="${highlighted.className}">${highlighted.html}</code>`
}
