import type { CSSProperties } from 'react'
import { METRIC_THRESHOLDS } from '../../analysis/thresholds.ts'
import type { Device, Metric } from '../../types.ts'
import { formatMetric, formatScore, metricRating, RATING_LABELS, scoreRating, type Rating } from '../format.ts'

export function RatingIcon({ rating }: { rating: Rating }) {
  return (
    <svg className={`rating-icon r-${rating}`} viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
      {rating === 'good' && <circle cx="5" cy="5" r="5" />}
      {rating === 'average' && <rect x="0.5" y="0.5" width="9" height="9" />}
      {rating === 'poor' && <path d="M5 0 10 10H0Z" />}
      {rating === 'none' && <rect x="1" y="4" width="8" height="2" />}
    </svg>
  )
}

export function ScoreRing({ score, label, size = 64 }: { score: number | null | undefined, label?: string, size?: number }) {
  const rating = scoreRating(score)
  const stroke = Math.max(3, Math.round(size / 14))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fill = score === null || score === undefined ? 0 : Math.max(0, Math.min(1, score))
  const text = formatScore(score)
  const description = `${label ? `${label}: ` : ''}${text === '—' ? 'not measured' : `${text} of 100, ${RATING_LABELS[rating]}`}`
  return (
    <figure className={`score-ring r-${rating}`} style={{ '--ring-size': `${size}px` } as CSSProperties} role="img" aria-label={description} title={description}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="score-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        {fill > 0 && (
          <circle
            className="score-ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${fill * circumference} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="score-ring-value" aria-hidden="true">{text}</span>
      {label && (
        <figcaption aria-hidden="true">
          {label}
        </figcaption>
      )}
    </figure>
  )
}

export function Score({ score, label }: { score: number | null | undefined, label?: string }) {
  const rating = scoreRating(score)
  const text = formatScore(score)
  return (
    <span className={`score r-${rating}`} title={label ? `${label}: ${RATING_LABELS[rating]}` : RATING_LABELS[rating]}>
      <RatingIcon rating={rating} />
      <span className="num">{text}</span>
    </span>
  )
}

export function ScoreBar({ score, label }: { score: number | null | undefined, label?: string }) {
  const rating = scoreRating(score)
  const text = formatScore(score)
  const width = score === null || score === undefined ? 0 : Math.max(0, Math.min(1, score)) * 100
  return (
    <span className={`score-bar r-${rating}`} role="img" aria-label={`${label ? `${label}: ` : ''}${text === '—' ? 'not measured' : `${text} of 100, ${RATING_LABELS[rating]}`}`}>
      <span className="score-bar-track" aria-hidden="true">
        <span className="score-bar-fill" style={{ width: `${width}%` }} />
      </span>
      <span className="score-bar-value" aria-hidden="true">
        <RatingIcon rating={rating} />
        <span className="num">{text}</span>
      </span>
    </span>
  )
}

export function MetricValue({ metric, value, device, icon = true }: { metric: Metric, value: number | null | undefined, device: Device, icon?: boolean }) {
  const rating = metricRating(metric, value, device)
  const { good, poor } = METRIC_THRESHOLDS[device][metric]
  const hint = `${RATING_LABELS[rating]} (good ≤ ${formatMetric(metric, good)}, poor > ${formatMetric(metric, poor)})`
  return (
    <span className={`metric r-${rating}`} title={hint}>
      {icon && rating !== 'none' && <RatingIcon rating={rating} />}
      <span className="num">{formatMetric(metric, value)}</span>
      <span className="sr-only">{`, ${RATING_LABELS[rating]}`}</span>
    </span>
  )
}

export type DeltaKind = 'score' | 'ms' | 'cls' | 'count'

export function Delta({ value, kind = 'score', noise = 0, higherIsBetter, change }: { value: number | null | undefined, kind?: DeltaKind, noise?: number, higherIsBetter?: boolean, change?: 'regressed' | 'improved' | 'unchanged' }) {
  if (value === null || value === undefined || Number.isNaN(value))
    return <span className="delta d-none">—</span>
  const better = higherIsBetter ?? kind === 'score'
  const display = kind === 'score' ? Math.round(value * 100) : kind === 'cls' ? Number(value.toFixed(3)) : Math.round(value)
  const withinNoise = change ? change === 'unchanged' : Math.abs(value) < noise || display === 0
  const improved = change ? change === 'improved' : better ? value > 0 : value < 0
  const tone = withinNoise ? 'flat' : improved ? 'up' : 'down'
  const sign = display > 0 ? '+' : display < 0 ? '−' : '±'
  const magnitude = Math.abs(display)
  const unit = kind === 'ms' ? ' ms' : ''
  const text = `${sign}${kind === 'cls' ? magnitude.toFixed(3) : magnitude}${unit}`
  const label = withinNoise ? `${text}, within noise` : `${text}, ${improved ? 'improved' : 'regressed'}`
  return (
    <span className={`delta d-${tone}`} title={label}>
      <span aria-hidden="true" className="delta-arrow">{tone === 'flat' ? '·' : value > 0 ? '↑' : '↓'}</span>
      <span className="num">{text}</span>
      <span className="sr-only">{withinNoise ? ', within noise' : improved ? ', improved' : ', regressed'}</span>
    </span>
  )
}
