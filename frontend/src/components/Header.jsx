import { Wind } from 'lucide-react'


export default function Header() {
  return (
    <header className="app-header" role="banner">
      <div className="header-brand">
        <div className="brand-logo" aria-hidden="true">
          <Wind size={20} color="white" />
        </div>
        <div>
          <div className="brand-name">
            Wind<span>IQ</span>
          </div>
          <div className="brand-tagline">Wind Forecast Accuracy Analytics</div>
        </div>
      </div>

      <div className="header-meta">
        <div className="data-source-badge" title="Data sourced from Elexon BMRS API — live historical records">
          <span className="status-dot" aria-hidden="true" />
          Elexon BMRS · Real Data · Jan 2026
        </div>
      </div>
    </header>
  )
}
