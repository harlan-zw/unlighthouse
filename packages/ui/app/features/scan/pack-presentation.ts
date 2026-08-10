export function formatRouteCount(count: number): string {
  return `${count} ${count === 1 ? 'route' : 'routes'}`
}
