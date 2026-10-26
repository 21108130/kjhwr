import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header.jsx'
import { KpiCard, CoverageBanner, LoadingState, ErrorState } from './components/KpiCards.jsx'
import {
  ForecastVsActualChart,
  ErrorTimeSeriesChart,
  DailyMaeChart,
  ScatterForecastActual,
  ErrorHistogram,
} from './components/Charts.jsx'
import IntervalTable from './components/IntervalTable.jsx'
import { fetchAccuracy, fetchConfig } from './api/client.js'
import { formatDate } from './utils/format.js'
import { BarChart3, CalendarDays, Table2, TrendingUp } from 'lucide-react'

const TABS = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
  { id: 'accuracy', label: 'Accuracy Analysis', icon: <TrendingUp size={14} /> },
  { id: 'data', label: 'Interval Data', icon: <Table2 size={14} /> },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')

 
  const [dateFrom, setDateFrom] = useState('2026-01-01')
  const [dateTo, setDateTo] = useState('2026-01-31')
  const [cutoffHour, setCutoffHour] = useState(10)
  const [cutoffMinute, setCutoffMinute] = useState(0)


  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)


  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      setLoading(true)
      try {
        const cfg = await fetchConfig()
        if (cancelled) return
        setCutoffHour(cfg.decision_cutoff_hour_utc)
        setCutoffMinute(cfg.decision_cutoff_minute_utc)
        const result = await fetchAccuracy({
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          cutoffHour: cfg.decision_cutoff_hour_utc,
          cutoffMinute: cfg.decision_cutoff_minute_utc,
        })
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    initialize()
    return () => { cancelled = true }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const result = await fetchAccuracy({
        dateFrom, dateTo,
        cutoffHour, cutoffMinute,
      })
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, cutoffHour, cutoffMinute])

  const params = { dateFrom, dateTo, cutoffHour, cutoffMinute }
  const metrics = data?.metrics
  const coverage = data?.coverage
  const intervals = data?.intervals || []
  const daily = data?.daily_summary || []
  const appliedCutoffHour = data?.cutoff_assumption?.hour_utc ?? cutoffHour
  const appliedCutoffMinute = data?.cutoff_assumption?.minute_utc ?? cutoffMinute

  return (
    <div className="app-wrapper">
      <Header />

      <main className="app-main">
        <section className="page-intro" aria-label="WindIQ analysis overview">
          <div className="page-intro-copy">
            <div className="page-eyebrow"><span className="page-eyebrow-dot" /> ENERGY INTELLIGENCE · GREAT BRITAIN</div>
            <h1>Read the wind before it moves.</h1>
            <p>Measure forecast performance using only the information available at decision time.</p>
          </div>
          <div className="period-summary">
            <CalendarDays size={18} aria-hidden="true" />
            <div>
              <span className="period-summary-label">DELIVERY WINDOW</span>
              <strong>{formatDate(dateFrom)} – {formatDate(dateTo)}</strong>
            </div>
          </div>
        </section>


        <section className="controls-panel" aria-label="Analysis parameters">
          <div className="controls-heading">
            <div>
              <span className="section-kicker">REFINE THE VIEW</span>
              <h2>Analysis parameters</h2>
            </div>
            <span className="analysis-mode"><span /> Historical analysis</span>
          </div>
          <div className="control-fields">
            <div className="control-group">
              <label className="control-label" htmlFor="date-from">Delivery date from</label>
              <input id="date-from" type="date" className="control-input" value={dateFrom} min="2026-01-01" max="2026-01-31" onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="control-group">
              <label className="control-label" htmlFor="date-to">Delivery date to</label>
              <input id="date-to" type="date" className="control-input" value={dateTo} min="2026-01-01" max="2026-01-31" onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="control-group cutoff-control">
              <label className="control-label" htmlFor="cutoff-hour">Cutoff hour · UTC</label>
              <input id="cutoff-hour" type="number" className="control-input" value={cutoffHour} min={0} max={23} onChange={e => setCutoffHour(Number(e.target.value))} />
            </div>
            <div className="control-group cutoff-control">
              <label className="control-label" htmlFor="cutoff-minute">Minute</label>
              <input id="cutoff-minute" type="number" className="control-input" value={cutoffMinute} min={0} max={59} onChange={e => setCutoffMinute(Number(e.target.value))} />
            </div>
            <div className="controls-actions">
              <button id="run-analysis-btn" className="btn btn-primary" onClick={loadData} disabled={loading} aria-busy={loading}>
                {loading ? 'Loading analysis…' : 'Run analysis'}
                {!loading && <span aria-hidden="true">↗</span>}
              </button>
            </div>
          </div>
          <div className="assumption-notice">
            <span className="assumption-mark" aria-hidden="true">i</span>
            <span><strong>Cutoff assumption:</strong> Forecasts published by {String(cutoffHour).padStart(2, '0')}:{String(cutoffMinute).padStart(2, '0')} UTC on the day before delivery are treated as available. This is configurable and is not an official market deadline. In January 2026, 10:00 UTC is 10:00 GMT in the UK.</span>
          </div>
        </section>


        {error && (
          <ErrorState
            title="Failed to fetch data"
            message={error}
            onRetry={loadData}
          />
        )}


        {loading && (
          <LoadingState
            message="Fetching wind generation data from Elexon BMRS…"
            sub="Retrieving January 2026 actuals and forecast publications. This may take up to 60 seconds on first load."
          />
        )}


        {!loading && data && (
          <div className="fade-in">

            <CoverageBanner coverage={coverage} />
            <div className="data-quality-note" role="note">
              <strong>Resolution and sample:</strong> Raw January WINDFOR `startTime` values are on the hour (minutes and seconds are 00); its stream response has no `settlementPeriod` field. FUELHH records occur every half-hour and include `settlementPeriod`. Each hourly WINDFOR period is compared with the mean of its two real FUELHH half-hours. No interpolation or repeated forecasts are added. Metrics use {metrics?.sample_size?.toLocaleString() ?? 0} matched hourly periods ({coverage?.actual_intervals?.toLocaleString() ?? 0} actual half-hour records; {coverage?.eligible_forecast_intervals?.toLocaleString() ?? 0} cutoff-eligible forecast hours).
            </div>


            <nav className="tab-nav" role="tablist" aria-label="Analysis views">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>


            {activeTab === 'overview' && (
              <div role="tabpanel" aria-labelledby="tab-overview">

                <div className="kpi-grid">
                  <KpiCard
                    label="MAE"
                    value={metrics?.mae_mw != null ? metrics.mae_mw.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null}
                    unit="MW"
                    accentClass="accent-blue"
                    sampleSize={metrics?.sample_size}
                    coveragePct={coverage?.coverage_pct}
                    description="Mean Absolute Error — average deviation between forecast and actual generation"
                    tooltip="Mean Absolute Error (MAE) measures the average magnitude of errors. Lower is better."
                  />
                  <KpiCard
                    label="RMSE"
                    value={metrics?.rmse_mw != null ? metrics.rmse_mw.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null}
                    unit="MW"
                    accentClass="accent-amber"
                    sampleSize={metrics?.sample_size}
                    coveragePct={coverage?.coverage_pct}
                    description="Root Mean Square Error — penalises large errors more than MAE"
                    tooltip="RMSE gives more weight to large errors. It indicates exposure to worst-case procurement mismatches."
                  />
                  <KpiCard
                    label="Bias"
                    value={metrics?.bias_mw != null ? (metrics.bias_mw > 0 ? '+' : '') + metrics.bias_mw.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null}
                    unit="MW"
                    accentClass={metrics?.bias_mw > 100 ? 'accent-red' : metrics?.bias_mw < -100 ? 'accent-green' : 'accent-purple'}
                    sampleSize={metrics?.sample_size}
                    coveragePct={coverage?.coverage_pct}
                    description={metrics?.bias_mw > 0 ? 'Systematic over-forecast — wind delivered less than predicted on average' : metrics?.bias_mw < 0 ? 'Systematic under-forecast — wind delivered more than predicted' : 'No systematic bias'}
                    tooltip="Bias = mean(Forecast − Actual). Positive means wind was consistently over-predicted; negative means under-predicted."
                  />
                  <KpiCard
                    label="MAPE"
                    value={metrics?.mape_pct != null ? metrics.mape_pct.toFixed(2) : null}
                    unit="%"
                    accentClass="accent-teal"
                    sampleSize={metrics?.sample_size}
                    coveragePct={coverage?.coverage_pct}
                    description="Mean Absolute Percentage Error — scale-independent accuracy measure"
                    tooltip="MAPE expresses the average error as a percentage of actual generation, allowing comparison across different generation levels."
                  />
                  <KpiCard
                    label="nRMSE"
                    value={metrics?.nrmse_pct != null ? metrics.nrmse_pct.toFixed(2) : null}
                    unit="%"
                    accentClass="accent-blue"
                    sampleSize={metrics?.sample_size}
                    coveragePct={coverage?.coverage_pct}
                    description="Normalised RMSE as % of mean actual — benchmark for forecast quality"
                    tooltip="nRMSE = RMSE ÷ mean actual × 100. Industry benchmark: <15% is considered good for wind forecasting."
                  />
                  <KpiCard
                    label="Correlation"
                    value={metrics?.correlation != null ? metrics.correlation.toFixed(4) : null}
                    accentClass="accent-green"
                    sampleSize={metrics?.sample_size}
                    coveragePct={coverage?.coverage_pct}
                    description="Pearson correlation between forecast and actual (1.0 = perfect)"
                    tooltip="Correlation coefficient: 1.0 = perfect alignment, 0 = no relationship. High correlation with low MAE indicates a well-calibrated forecast."
                  />
                </div>


                <div className="chart-card" style={{ marginBottom: 24 }}>
                  <div className="chart-header">
                    <div>
                      <div className="chart-title">Forecast vs Actual Wind Generation</div>
                      <div className="chart-subtitle">
                        Hourly forecast selected at or before {String(appliedCutoffHour).padStart(2,'0')}:{String(appliedCutoffMinute).padStart(2,'0')} UTC on day-1 · {formatDate(data?.date_range?.from || dateFrom)} – {formatDate(data?.date_range?.to || dateTo)}
                      </div>
                    </div>
                    <div className="chart-legend">
                      <div className="legend-item">
                        <div className="legend-dot" style={{ background: '#10b981' }} />
                        Actual (FUELHH)
                      </div>
                      <div className="legend-item">
                        <div className="legend-line" style={{ background: '#3b82f6' }} />
                        Forecast (WINDFOR)
                      </div>
                    </div>
                  </div>
                  <ForecastVsActualChart intervals={intervals} />
                </div>


                <div className="chart-section two-col">
                  <div className="chart-card">
                    <div className="chart-header">
                      <div>
                        <div className="chart-title">Forecast Error Over Time</div>
                        <div className="chart-subtitle">Error = Forecast − Actual · Red = over-forecast · Green = under-forecast</div>
                      </div>
                    </div>
                    <ErrorTimeSeriesChart intervals={intervals} />
                  </div>
                  <div className="chart-card">
                    <div className="chart-header">
                      <div>
                        <div className="chart-title">Error Distribution</div>
                        <div className="chart-subtitle">Histogram of forecast errors (MW)</div>
                      </div>
                    </div>
                    <ErrorHistogram intervals={intervals} />
                  </div>
                </div>
              </div>
            )}


            {activeTab === 'accuracy' && (
              <div role="tabpanel" aria-labelledby="tab-accuracy">

                <div className="chart-section two-col" style={{ marginBottom: 24 }}>
                  <div className="chart-card">
                    <div className="chart-header">
                      <div>
                        <div className="chart-title">Daily MAE & RMSE</div>
                        <div className="chart-subtitle">Per-day accuracy breakdown · Bars = MAE · Line = RMSE</div>
                      </div>
                    </div>
                    <DailyMaeChart dailySummary={daily} />
                  </div>
                  <div className="chart-card">
                    <div className="chart-header">
                      <div>
                        <div className="chart-title">Forecast vs Actual Scatter</div>
                        <div className="chart-subtitle">Dashed line = perfect forecast · Scatter above = over-forecast</div>
                      </div>
                    </div>
                    <ScatterForecastActual intervals={intervals} />
                  </div>
                </div>


                <div className="table-section">
                  <div className="table-header">
                    <div className="table-title">Daily Accuracy Summary</div>
                  </div>
                  <div className="table-wrapper">
                    <table aria-label="Daily accuracy summary">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Matched Hours</th>
                          <th>Mean Actual (MW)</th>
                          <th>Mean Forecast (MW)</th>
                          <th>Daily MAE (MW)</th>
                          <th>Daily RMSE (MW)</th>
                          <th>Daily Bias (MW)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {daily.map(d => (
                          <tr key={d.date}>
                            <td className="mono">{formatDate(d.date)}</td>
                            <td className="mono">{d.count}</td>
                            <td className="mono">{d.mean_actual_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</td>
                            <td className="mono">{d.mean_forecast_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</td>
                            <td className="mono" style={{ color: 'var(--color-warning)' }}>{d.mae_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</td>
                            <td className="mono" style={{ color: 'var(--color-forecast)' }}>{d.rmse_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</td>
                            <td className={`mono ${d.bias_mw > 0 ? 'value-negative' : d.bias_mw < 0 ? 'value-positive' : 'value-neutral'}`}>
                              {d.bias_mw > 0 ? '+' : ''}{d.bias_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>


                <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 24px', marginTop: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--color-text-primary)' }}>
                    📊 Metric Glossary for Procurement Teams
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                    {[
                      { term: 'MAE (Mean Absolute Error)', def: 'Average absolute deviation between forecast and actual generation. Directly interpretable in MW — use this as the primary buffer size when procuring thermal backup.' },
                      { term: 'RMSE (Root Mean Square Error)', def: 'Like MAE but penalises large errors more. A high RMSE relative to MAE indicates infrequent but severe mismatches — relevant for peak procurement planning.' },
                      { term: 'Bias', def: 'Average signed error (Forecast − Actual). Positive bias means wind was consistently over-predicted; you received less wind than forecast, requiring more thermal backup than planned.' },
                      { term: 'MAPE', def: 'Mean Absolute Percentage Error — error as a percentage of actual generation. Useful for comparing across different wind conditions.' },
                      { term: 'nRMSE', def: 'RMSE normalised by mean actual generation. Benchmark: <10% excellent, 10–20% acceptable for day-ahead wind forecasting.' },
                      { term: 'Correlation', def: 'How well the forecast tracks the actual generation pattern (1.0 = perfect). Even high-correlation forecasts can have significant MAE if they are biased.' },
                    ].map(({ term, def }) => (
                      <div key={term} style={{ padding: '12px 16px', background: 'var(--color-bg-input)', borderRadius: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-brand-light)', marginBottom: 6 }}>{term}</div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{def}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}


            {activeTab === 'data' && (
              <div role="tabpanel" aria-labelledby="tab-data">
                <IntervalTable intervals={intervals} params={params} />
              </div>
            )}
          </div>
        )}

        {!loading && !error && !data && (
          <div className="empty-state">
            <div className="empty-icon">🌬️</div>
              <div className="empty-title">Ready to Analyse</div>
            <div className="empty-subtitle">
              Configure the date range and decision cutoff above, then click <strong>Run Analysis</strong> to load January 2026 wind forecast accuracy data from Elexon BMRS.
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        WindIQ · Data sourced from{' '}
        <a href="https://bmrs.elexon.co.uk" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand-light)' }}>
          Elexon BMRS
        </a>{' '}
        · FUELHH (actual generation) and WINDFOR (wind generation forecasts) · Analysis period: January 2026
      </footer>
    </div>
  )
}

