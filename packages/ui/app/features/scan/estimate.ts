import type { Category, Device } from '@unlighthouse/contracts'

export type ScanDeviceChoice = Device | 'both'

export interface ScanEstimateInput {
  urlCount: number
  device: ScanDeviceChoice
  sampleSize: number
  categories: Category[]
}

export interface ScanDurationEstimate {
  minSeconds: number
  maxSeconds: number
  auditRuns: number
  factors: string[]
  label: string
}

const categoryWeights: Record<Category, number> = {
  'performance': 0.4,
  'accessibility': 0.2,
  'seo': 0.15,
  'best-practices': 0.15,
  'agentic-browsing': 0.1,
}

const deviceSeconds: Record<ScanDeviceChoice, { min: number, max: number, profiles: number }> = {
  mobile: { min: 12, max: 24, profiles: 1 },
  desktop: { min: 8, max: 18, profiles: 1 },
  both: { min: 20, max: 42, profiles: 2 },
}

function durationLabel(seconds: number): string {
  if (seconds < 60)
    return '<1 min'
  if (seconds < 3_600)
    return `${Math.max(1, Math.round(seconds / 60))} min`
  const hours = seconds / 3_600
  return hours < 10 ? `${hours.toFixed(1)} hr` : `${Math.round(hours)} hr`
}

function rangeLabel(minSeconds: number, maxSeconds: number): string {
  const min = durationLabel(minSeconds)
  const max = durationLabel(maxSeconds)
  return min === max ? `About ${max}` : `${min} to ${max}`
}

export function estimateScanDuration(input: ScanEstimateInput): ScanDurationEstimate {
  const urls = Math.max(1, Math.floor(input.urlCount))
  const samples = Math.max(1, Math.floor(input.sampleSize))
  const profile = deviceSeconds[input.device]
  const selectedWeight = input.categories.reduce((sum, category) => sum + categoryWeights[category], 0)
  // Browser startup, navigation, and report assembly remain even for one
  // category, so narrowing cannot reduce runtime below 35% of a full audit.
  const categoryFactor = Math.max(0.35, Math.min(1, selectedWeight))
  const discoverySeconds = urls > 1 ? Math.min(90, 5 + Math.ceil(urls / 10)) : 0
  const minSeconds = Math.ceil(urls * samples * profile.min * categoryFactor + discoverySeconds)
  const maxSeconds = Math.ceil(urls * samples * profile.max * categoryFactor + discoverySeconds * 2)
  const categoryCount = input.categories.length

  return {
    minSeconds,
    maxSeconds,
    auditRuns: urls * samples * profile.profiles,
    factors: [
      `${urls} ${urls === 1 ? 'URL' : 'URLs'}`,
      input.device === 'both' ? '2 devices' : `1 ${input.device} device`,
      `${samples} ${samples === 1 ? 'sample' : 'samples'}`,
      `${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}`,
    ],
    label: rangeLabel(minSeconds, maxSeconds),
  }
}
