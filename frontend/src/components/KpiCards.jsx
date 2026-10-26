import { Info } from 'lucide-react'


export function KpiCard({ label, value, unit, description, accentClass = 'accent-blue', tooltip, sampleSize, coveragePct }) {
  return (
    <div className={`kpi-card ${accentClass}`} title={tooltip}>
      <div className="kpi-label">
        {label}
        {tooltip && <Info size={12} style={{ opacity: 0.6 }} />}
      </div>
      <div className="kpi-value">
        {value ?? '—'}
        {value !== null && value !== undefined && unit && (
          <span className="kpi-unit">{unit}</span>
        )}
      </div>
      {description && <div className="kpi-description">{description}</div>}
      {sampleSize != null && <div className="kpi-description">n={sampleSize.toLocaleString()} matched hourly intervals · {coveragePct}% coverage</div>}
    </div>
  )
}


export function CoverageBanner({ coverage }) {
  if (!coverage) return null
  const { total_intervals, actual_intervals, eligible_forecast_intervals, comparison_periods, paired_intervals, unmatched_intervals, coverage_pct } = coverage

  return (
    <div className="coverage-banner" role="region" aria-label="Data coverage statistics">
      <div className="coverage-stat">
        <span className="coverage-stat-value">{(actual_intervals ?? total_intervals).toLocaleString()}</span>
        <span className="coverage-stat-label">FUELHH Half-Hours</span>
      </div>
      <div className="coverage-divider" aria-hidden="true" />
      <div className="coverage-stat">
        <span className="coverage-stat-value">{eligible_forecast_intervals?.toLocaleString() ?? '—'}</span>
          <span className="coverage-stat-label">Eligible Hourly Forecasts</span>
      </div>
      <div className="coverage-divider" aria-hidden="true" />
      <div className="coverage-stat">
        <span className="coverage-stat-value" style={{ color: 'var(--color-actual)' }}>
          {paired_intervals.toLocaleString()} / {(comparison_periods ?? paired_intervals).toLocaleString()}
        </span>
        <span className="coverage-stat-label">Matched / eligible hourly periods</span>
      </div>
      <div className="coverage-divider" aria-hidden="true" />
      <div className="coverage-stat">
        <span className="coverage-stat-value" style={{ color: unmatched_intervals > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
          {(unmatched_intervals ?? coverage.no_forecast_intervals ?? 0).toLocaleString()}
        </span>
        <span className="coverage-stat-label">Unmatched Hours</span>
      </div>
      <div className="coverage-divider" aria-hidden="true" />
      <div className="coverage-progress">
        <div className="coverage-progress-label">
          <span>Forecast Coverage</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {coverage_pct}%
          </span>
        </div>
        <div className="coverage-bar" role="progressbar" aria-valuenow={coverage_pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="coverage-bar-fill" style={{ width: `${coverage_pct}%` }} />
        </div>
      </div>
    </div>
  )
}


export function LoadingState({ message = 'Loading data from Elexon BMRS…', sub }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <div>
        <div className="loading-title">{message}</div>
        {sub && <div className="loading-subtitle">{sub}</div>}
      </div>
    </div>
  )
}


export function ErrorState({ title = 'Failed to load data', message, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <span className="error-icon" aria-hidden="true">✕</span>
      <div>
        <div className="error-title">{title}</div>
        <div className="error-message">{message}</div>
        {onRetry && (
          <button className="btn btn-secondary" onClick={onRetry} style={{ marginTop: '12px' }}>
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
