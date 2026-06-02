/**
 * Resolve a route's screenshot URL. In a static (offline) report the build
 * exports screenshots to `assets/screenshots/*` and embeds a `path → url` map in
 * the payload (#275); use that so thumbnails resolve without the dead API. Live
 * mode falls back to the `/dashboard/screenshot` endpoint.
 */
export function useScreenshotUrl() {
  const baseUrl = useRuntimeConfig().public.unlighthouseApiUrl as string
  return (scanId: string, path: string): string => {
    if (import.meta.client) {
      const map = (window as unknown as { __unlighthouse_payload?: { screenshots?: Record<string, string> } })
        .__unlighthouse_payload?.screenshots
      if (map && map[path])
        return map[path]
    }
    return `${baseUrl}/dashboard/screenshot/${scanId}/${encodeURIComponent(path)}`
  }
}
