/**
 * Figma-style squircle (smooth-corner) SVG path generation.
 *
 * Vendored and trimmed from Lisse (`@lisse/core`, MIT © Jace), which in turn
 * implements Figma's smoothing algorithm via MartinRGB's approximation:
 *   https://www.figma.com/blog/desperately-seeking-squircles/
 *   https://github.com/MartinRGB/Figma_Squircles_Approximation
 *
 * We only need the uniform-radius squircle curve (not arc / superellipse /
 * clothoid, nor per-corner config), so this is the squircle path math only.
 * Used as the Safari/Firefox fallback for the native CSS `corner-shape:
 * squircle` progressive enhancement (see global.css + UiCard).
 */

export interface SquircleOptions {
  /** Corner radius in px. */
  radius: number
  /** 0 (sharp) → 1 (max). Default 0.6 (Figma's value). */
  smoothing?: number
  /** Keep the smoothing even when the corner is space-constrained. Default true. */
  preserveSmoothing?: boolean
}

interface CornerPathParams {
  a: number
  b: number
  c: number
  d: number
  p: number
  arcSectionLength: number
  cornerRadius: number
}

const toRadians = (deg: number) => (deg * Math.PI) / 180
const f = (n: number) => n.toFixed(4)

/** Tagged template that formats interpolated numbers to 4 decimal places. */
function rounded(strings: TemplateStringsArray, ...values: number[]): string {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    out += `${value === undefined ? '' : value.toFixed(4)}${strings[i + 1] ?? ''}`
  }
  return out
}

const adjacentsByCorner = {
  topLeft: [{ corner: 'topRight', side: 'top' }, { corner: 'bottomLeft', side: 'left' }],
  topRight: [{ corner: 'topLeft', side: 'top' }, { corner: 'bottomRight', side: 'right' }],
  bottomLeft: [{ corner: 'bottomRight', side: 'bottom' }, { corner: 'topLeft', side: 'left' }],
  bottomRight: [{ corner: 'bottomLeft', side: 'bottom' }, { corner: 'topRight', side: 'right' }],
} as const

type Corner = keyof typeof adjacentsByCorner

/**
 * Distribute available space among corners, clamping radii so they can't
 * exceed the rectangle. Larger corners get priority. With a uniform radius
 * this only matters on small/thin elements.
 */
function distributeAndNormalize(radius: number, width: number, height: number) {
  const radii: Record<Corner, number> = { topLeft: radius, topRight: radius, bottomLeft: radius, bottomRight: radius }
  const budgets: Record<Corner, number> = { topLeft: -1, topRight: -1, bottomLeft: -1, bottomRight: -1 }

  ;(Object.entries(radii) as [Corner, number][])
    .sort(([, r1], [, r2]) => r2 - r1)
    .forEach(([corner, r]) => {
      const budget = Math.min(...adjacentsByCorner[corner].map((adj) => {
        const adjRadius = radii[adj.corner]
        if (r === 0 && adjRadius === 0)
          return 0
        const adjBudget = budgets[adj.corner]
        const sideLength = adj.side === 'top' || adj.side === 'bottom' ? width : height
        return adjBudget >= 0 ? sideLength - adjBudget : (r / (r + adjRadius)) * sideLength
      }))
      budgets[corner] = budget
      radii[corner] = Math.min(r, budget)
    })

  return { radii, budgets }
}

/** Bézier-curve parameters for one corner (Figma squircle). */
function getPathParamsForCorner(cornerRadius: number, cornerSmoothing: number, preserveSmoothing: boolean, budget: number): CornerPathParams {
  if (cornerRadius <= 0)
    return { a: 0, b: 0, c: 0, d: 0, p: 0, arcSectionLength: 0, cornerRadius: 0 }

  let p = (1 + cornerSmoothing) * cornerRadius
  if (!preserveSmoothing) {
    const maxSmoothing = budget / cornerRadius - 1
    cornerSmoothing = Math.min(cornerSmoothing, maxSmoothing)
    p = Math.min(p, budget)
  }

  const arcMeasure = 90 * (1 - cornerSmoothing)
  const arcSectionLength = Math.sin(toRadians(arcMeasure / 2)) * cornerRadius * Math.sqrt(2)
  const angleAlpha = (90 - arcMeasure) / 2
  const p3ToP4Distance = cornerRadius * Math.tan(toRadians(angleAlpha / 2))
  const angleBeta = 45 * cornerSmoothing
  const c = p3ToP4Distance * Math.cos(toRadians(angleBeta))
  const d = c * Math.tan(toRadians(angleBeta))

  let b = (p - arcSectionLength - c - d) / 3
  let a = 2 * b
  if (preserveSmoothing && p > budget) {
    const p1ToP3MaxDistance = budget - d - arcSectionLength - c
    const minA = p1ToP3MaxDistance / 6
    const maxB = p1ToP3MaxDistance - minA
    b = Math.min(b, maxB)
    a = p1ToP3MaxDistance - b
    p = Math.min(p, budget)
  }

  return { a, b, c, d, p, arcSectionLength, cornerRadius }
}

function drawTopRight({ cornerRadius, a, b, c, d, arcSectionLength }: CornerPathParams) {
  return cornerRadius
    ? rounded`c ${a} 0 ${a + b} 0 ${a + b + c} ${d} a ${cornerRadius} ${cornerRadius} 0 0 1 ${arcSectionLength} ${arcSectionLength} c ${d} ${c} ${d} ${b + c} ${d} ${a + b + c}`
    : ''
}
function drawBottomRight({ cornerRadius, a, b, c, d, arcSectionLength }: CornerPathParams) {
  return cornerRadius
    ? rounded`c 0 ${a} 0 ${a + b} ${-d} ${a + b + c} a ${cornerRadius} ${cornerRadius} 0 0 1 ${-arcSectionLength} ${arcSectionLength} c ${-c} ${d} ${-(b + c)} ${d} ${-(a + b + c)} ${d}`
    : ''
}
function drawBottomLeft({ cornerRadius, a, b, c, d, arcSectionLength }: CornerPathParams) {
  return cornerRadius
    ? rounded`c ${-a} 0 ${-(a + b)} 0 ${-(a + b + c)} ${-d} a ${cornerRadius} ${cornerRadius} 0 0 1 ${-arcSectionLength} ${-arcSectionLength} c ${-d} ${-c} ${-d} ${-(b + c)} ${-d} ${-(a + b + c)}`
    : ''
}
function drawTopLeft({ cornerRadius, a, b, c, d, arcSectionLength }: CornerPathParams) {
  return cornerRadius
    ? rounded`c 0 ${-a} 0 ${-(a + b)} ${d} ${-(a + b + c)} a ${cornerRadius} ${cornerRadius} 0 0 1 ${arcSectionLength} ${-arcSectionLength} c ${c} ${-d} ${b + c} ${-d} ${a + b + c} ${-d}`
    : ''
}

/** SVG path `d` string for a smooth-cornered rectangle, traversed clockwise from the top-left. */
export function squircleSvgPath(width: number, height: number, { radius, smoothing = 0.6, preserveSmoothing = true }: SquircleOptions): string {
  if (width <= 0 || height <= 0)
    return ''
  const { radii, budgets } = distributeAndNormalize(radius, width, height)
  const params = (c: Corner) => getPathParamsForCorner(radii[c], smoothing, preserveSmoothing, budgets[c])
  const tl = params('topLeft')
  const tr = params('topRight')
  const br = params('bottomRight')
  const bl = params('bottomLeft')

  return `M ${f(tl.p)} 0`
    + ` L ${f(width - tr.p)} 0 ${drawTopRight(tr)}`
    + ` L ${f(width)} ${f(br.p)} L ${f(width)} ${f(height - br.p)} ${drawBottomRight(br)}`
    + ` L ${f(width - bl.p)} ${f(height)} L ${f(bl.p)} ${f(height)} ${drawBottomLeft(bl)}`
    + ` L 0 ${f(height - tl.p)} L 0 ${f(tl.p)} ${drawTopLeft(tl)} Z`
}
