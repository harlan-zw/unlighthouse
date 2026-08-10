/** Allow the configured hostname and its subdomains into scan discovery. */
export function isScanOrigin(deps: { siteUrl: URL }, value: string): boolean {
  const url = new URL(value, deps.siteUrl)
  return url.hostname === deps.siteUrl.hostname
    || url.hostname.endsWith(`.${deps.siteUrl.hostname}`)
}
