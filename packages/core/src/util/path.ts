import { createHash } from 'node:crypto'
import sanitize from 'sanitize-filename'
import slugify from 'slugify'
import { withoutLeadingSlash, withoutTrailingSlash } from 'ufo'

/** Strip leading + trailing slashes. */
export const trimSlashes = (s: string) => withoutLeadingSlash(withoutTrailingSlash(s))

/** Sanitise a URL for use as a filesystem path; retains the path hierarchy. */
export function sanitiseUrlForFilePath(url: string) {
  url = trimSlashes(url)
  if (url.endsWith('.html'))
    url = url.replace(/\.html$/, '')

  return url
    .split('/')
    .map(part => sanitize(slugify(part)))
    .join('/')
}

/** Turn a web path into a 6-char hash for stable identification. */
export function hashPathName(path: string) {
  return createHash('md5')
    .update(sanitiseUrlForFilePath(path))
    .digest('hex')
    .substring(0, 6)
}
