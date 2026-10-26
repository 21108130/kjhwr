

const LONDON_TZ = 'Europe/London'


export const formatDateTime = (isoStr) => {
  if (!isoStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}


export const formatTime = (isoStr) => {
  if (!isoStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON_TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}


export const formatShortDate = (isoStr) => {
  if (!isoStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}


export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(dateStr + 'T12:00:00Z'))
  } catch {
    return dateStr
  }
}


export const formatMW = (value, decimals = 0) => {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MW`
}


export const formatPct = (value, decimals = 1) => {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(decimals)}%`
}


export const formatError = (value) => {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW`
}


export const getErrorClass = (value) => {
  if (value === null || value === undefined) return 'value-null'
  if (value > 0) return 'value-negative'
  if (value < 0) return 'value-positive'
  return 'value-neutral'
}


export const coverageLabel = (pct) => {
  if (pct >= 90) return { label: 'Excellent', color: '#10b981' }
  if (pct >= 70) return { label: 'Good', color: '#3b82f6' }
  if (pct >= 50) return { label: 'Partial', color: '#f59e0b' }
  return { label: 'Low', color: '#ef4444' }
}


export const mwTickFormatter = (value) => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}


export const dateAxisFormatter = (isoStr) => {
  if (!isoStr) return ''
  return isoStr.slice(5, 10) // "MM-DD"
}
