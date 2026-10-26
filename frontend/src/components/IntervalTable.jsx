import { useState, useMemo } from 'react'
import { formatDateTime, formatError, formatPct, getErrorClass } from '../utils/format.js'
import { Download, Search } from 'lucide-react'
import { buildCsvUrl } from '../api/client.js'

const PAGE_SIZE = 50


export default function IntervalTable({ intervals, params }) {
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('all') // 'all' | 'matched' | 'missing'
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let rows = intervals || []
    if (filter === 'matched') rows = rows.filter(r => r.error_mw !== null)
    if (filter === 'missing') rows = rows.filter(r => r.error_mw === null)
    if (search) {
      const s = search.toLowerCase()
      rows = rows.filter(r => r.start_time?.includes(s) || formatDateTime(r.start_time).toLowerCase().includes(s))
    }
    return rows
  }, [intervals, filter, search])

  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleFilterChange = (f) => {
    setFilter(f)
    setPage(0)
  }

  return (
    <div className="table-section">
      <div className="table-header">
        <div>
          <div className="table-title">Interval-Level Data</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {filtered.length.toLocaleString()} of {(intervals?.length || 0).toLocaleString()} intervals · Times in Europe/London
          </div>
        </div>
        <div className="table-controls">
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'matched', 'missing'].map(f => (
              <button
                key={f}
                className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => handleFilterChange(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <a
            href={buildCsvUrl(params)}
            download
            className="btn btn-export"
            aria-label="Export data as CSV"
          >
            <Download size={14} />
            Export CSV
          </a>
        </div>
      </div>

      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ position: 'relative', maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="control-input"
            style={{ paddingLeft: 32 }}
            placeholder="Filter by date (e.g. 05 Jan 2026 or 2026-01-05)"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            aria-label="Filter intervals by date"
          />
        </div>
      </div>

      <div className="table-wrapper">
        <table aria-label="Wind forecast accuracy intervals">
          <thead>
            <tr>
              <th>Delivery Time (UK)</th>
              <th>Actual (MW)</th>
              <th>Source half-hours</th>
              <th>Forecast (MW)</th>
              <th>Published At (UK)</th>
              <th>Error (MW)</th>
              <th>|Error| (MW)</th>
              <th>Error (%)</th>
              <th>Status</th>
              <th>Reason if unmatched</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                  No intervals match the current filter
                </td>
              </tr>
            ) : pageData.map((row, i) => (
              <tr key={row.start_time || i}>
                <td className="mono">{formatDateTime(row.start_time)}</td>
                <td className="mono">{row.actual_mw != null ? `${row.actual_mw.toLocaleString('en-GB', { maximumFractionDigits: 1 })} MW` : <span className="value-null">—</span>}</td>
                <td className="mono">{row.actual_interval_count ?? 0}</td>
                <td className="mono">
                  {row.forecast_mw !== null ? `${row.forecast_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW` : <span className="value-null">—</span>}
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {row.publish_time ? formatDateTime(row.publish_time) : <span className="value-null">—</span>}
                </td>
                <td className={`mono ${getErrorClass(row.error_mw)}`}>
                  {row.error_mw !== null ? formatError(row.error_mw) : <span className="value-null">—</span>}
                </td>
                <td className="mono">
                  {row.abs_error_mw !== null ? `${row.abs_error_mw?.toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW` : <span className="value-null">—</span>}
                </td>
                <td className={`mono ${getErrorClass(row.pct_error)}`}>
                  {row.pct_error !== null ? formatPct(row.pct_error) : <span className="value-null">—</span>}
                </td>
                <td>
                  {row.error_mw !== null
                    ? <span className="badge badge-matched">Matched</span>
                    : <span className="badge badge-missing">Unmatched</span>}
                </td>
                <td>{row.unmatched_reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Page {page + 1} of {pages}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '4px 12px', fontSize: 13 }}>
              ← Prev
            </button>
            <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page === pages - 1} style={{ padding: '4px 12px', fontSize: 13 }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
