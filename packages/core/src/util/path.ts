import { withoutLeadingSlash, withoutTrailingSlash } from 'ufo'
import { sha1Hex } from './sha1'

/** Strip leading + trailing slashes. */
export const trimSlashes = (s: string) => withoutLeadingSlash(withoutTrailingSlash(s))

const CONTROL_AND_RESERVED_RE = /[\p{Cc}<>:"\\|?*]/gu
const COMBINING_MARKS_RE = /[\u0300-\u036F]/g
const RESERVED_BASENAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

function sanitisePathSegment(segment: string): string {
  const slug = segment
    .normalize('NFKD')
    .replace(COMBINING_MARKS_RE, '')
    .replace(/['’]/g, '')
    .replace(/[^\w.~-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(CONTROL_AND_RESERVED_RE, '')
    .replace(/[ .]+$/g, '')

  if (!slug || slug === '.' || slug === '..')
    return ''
  if (RESERVED_BASENAME_RE.test(slug))
    return `_${slug}`
  return slug
}

/** Sanitise a URL for use as a filesystem path; retains the path hierarchy. */
export function sanitiseUrlForFilePath(url: string) {
  url = trimSlashes(url)
  if (url.endsWith('.html'))
    url = url.replace(/\.html$/, '')

  return url
    .split('/')
    .map(part => sanitisePathSegment(part))
    .join('/')
}

/** Turn a web path into a 6-char hash for stable identification. */
export function hashPathName(path: string) {
  return sha1Hex(sanitiseUrlForFilePath(path)).substring(0, 6)
}
