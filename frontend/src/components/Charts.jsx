import {
  ComposedChart, BarChart,
  Line, Bar, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  Area
} from 'recharts'
import { formatDate, formatDateTime, mwTickFormatter } from '../utils/format.js'

const COLORS = {
  forecast: '#a8795e',
  actual: '#60412f',
  error: '#bd8c63',
  overForecast: '#b64f43',
  underForecast: '#568b65',
  zero: '#77665a',
}


const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '10px',
      padding: '12px 14px',
      boxShadow: 'var(--shadow-lg)',
      minWidth: 180,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', flex: 1 }}>{entry.name}</span>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {typeof entry.value === 'number' ? `${entry.value.toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW` : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const ErrorTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '10px',
      padding: '12px 14px',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: v >= 0 ? COLORS.overForecast : COLORS.actual }}>
        {v >= 0 ? '+' : ''}{v?.toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
        {v > 0 ? 'Over-forecast (wind less than predicted)' : v < 0 ? 'Under-forecast (wind more than predicted)' : 'Exact forecast'}
      </div>
    </div>
  )
}


export function ForecastVsActualChart({ intervals, selectedDate }) {

  const data = intervals
    .filter(r => r.forecast_mw !== null && r.actual_mw !== null)
    .filter(r => !selectedDate || r.start_time.startsWith(selectedDate))
    .map(r => ({
      time: formatDateTime(r.start_time),
      forecast: r.forecast_mw,
      actual: r.actual_mw,
      raw_time: r.start_time,
    }))

  if (!data.length) return <div className="empty-state"><div className="empty-title">No paired data available for this period</div></div>

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={mwTickFormatter}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11, offset: 8 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="actual"
          name="Actual"
          stroke={COLORS.actual}
          fill={COLORS.actual}
          fillOpacity={0.08}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: COLORS.actual }}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          name="Forecast (at decision time)"
          stroke={COLORS.forecast}
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
          activeDot={{ r: 4, fill: COLORS.forecast }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}


export function ErrorTimeSeriesChart({ intervals }) {
  const data = intervals
    .filter(r => r.error_mw !== null)
    .map(r => ({
      time: formatDateTime(r.start_time),
      error: r.error_mw,
      fill: r.error_mw >= 0 ? COLORS.overForecast : COLORS.actual,
    }))

  if (!data.length) return <div className="empty-state"><div className="empty-title">No error data available</div></div>

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} barSize={data.length > 200 ? 1 : 2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={mwTickFormatter}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11, offset: 8 }}
        />
        <Tooltip content={<ErrorTooltip />} />
        <ReferenceLine y={0} stroke="var(--color-border-light)" strokeWidth={1.5} />
        <Bar dataKey="error" name="Error (Forecast − Actual)">
          {data.map((entry, i) => (
            <rect key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}


export function DailyMaeChart({ dailySummary }) {
  const data = dailySummary.map(d => ({
    date: formatDate(d.date),
    mae: d.mae_mw,
    rmse: d.rmse_mw,
    bias: d.bias_mw,
  }))

  if (!data.length) return null

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={mwTickFormatter}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11, offset: 8 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="mae" name="Daily MAE" fill={COLORS.error} opacity={0.8} radius={[2,2,0,0]} barSize={18} />
        <Line dataKey="rmse" name="Daily RMSE" stroke={COLORS.forecast} strokeWidth={2} dot={false} />
        <ReferenceLine y={0} stroke="var(--color-border-light)" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}


export function ScatterForecastActual({ intervals }) {
  const data = intervals
    .filter(r => r.forecast_mw !== null && r.actual_mw !== null)
    .map(r => ({
      actual: r.actual_mw,
      forecast: r.forecast_mw,
      start_time: r.start_time,
    }))

  if (!data.length) return null

  const maxVal = Math.max(...data.map(d => Math.max(d.actual, d.forecast)), 1000)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          type="number"
          dataKey="actual"
          name="Actual"
          domain={[0, maxVal * 1.05]}
          tickFormatter={mwTickFormatter}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          label={{ value: 'Actual MW', position: 'insideBottom', offset: -4, fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="forecast"
          name="Forecast"
          domain={[0, maxVal * 1.05]}
          tickFormatter={mwTickFormatter}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
          label={{ value: 'Forecast MW', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11, offset: 8 }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0]?.payload
            return (
              <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{formatDateTime(p.start_time)}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Actual: <b style={{ color: COLORS.actual }}>{p.actual?.toLocaleString()} MW</b></div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Forecast: <b style={{ color: COLORS.forecast }}>{p.forecast?.toLocaleString()} MW</b></div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>Error: {((p.forecast - p.actual) >= 0 ? '+' : '')}{(p.forecast - p.actual).toFixed(0)} MW</div>
              </div>
            )
          }}
        />
        {/* Perfect forecast line y=x */}
        <Line
          data={[{ actual: 0, forecast: 0 }, { actual: maxVal, forecast: maxVal }]}
          dataKey="forecast"
          name="Perfect forecast"
          stroke="var(--color-border-light)"
          strokeDasharray="4 2"
          dot={false}
          strokeWidth={1.5}
        />
        <Scatter
          data={data}
          name="Intervals"
          fill={COLORS.forecast}
          fillOpacity={0.5}
          r={3}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}


export function ErrorHistogram({ intervals }) {
  const errors = intervals.filter(r => r.error_mw !== null).map(r => r.error_mw)
  if (!errors.length) return null

 
  const min = Math.min(...errors)
  const max = Math.max(...errors)
  const binCount = Math.min(20, Math.ceil(errors.length / 10))
  const binWidth = (max - min) / binCount || 1
  const bins = Array.from({ length: binCount }, (_, i) => ({
    start: min + i * binWidth,
    end: min + (i + 1) * binWidth,
    count: 0,
  }))

  errors.forEach(e => {
    const idx = Math.min(Math.floor((e - min) / binWidth), binCount - 1)
    if (idx >= 0) bins[idx].count++
  })

  const data = bins.map(b => ({
    bin: `${b.start >= 0 ? '+' : ''}${b.start.toFixed(0)}`,
    count: b.count,
    fill: (b.start + b.end) / 2 >= 0 ? COLORS.overForecast : COLORS.actual,
    midpoint: (b.start + b.end) / 2,
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="bin"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          label={{ value: 'Error (MW)', position: 'insideBottom', offset: -4, fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
          label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            return (
              <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Error range: {payload[0]?.payload.bin} MW</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>{payload[0]?.value} intervals</div>
              </div>
            )
          }}
        />
        <ReferenceLine x="0" stroke="var(--color-border-light)" strokeDasharray="4 2" />
        <Bar dataKey="count" radius={[2,2,0,0]}>
          {data.map((entry, i) => (
            <rect key={i} fill={entry.fill} fillOpacity={0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
