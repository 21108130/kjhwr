
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})


api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const detail = err.response?.data?.detail || err.message || 'Unknown error'
    return Promise.reject(new Error(detail))
  }
)


export const fetchConfig = () => api.get('/api/config')

/**
 * Fetch the main accuracy analysis for a date range with a given decision cutoff.
 * @param {Object} params
 * @param {string} params.dateFrom - YYYY-MM-DD
 * @param {string} params.dateTo   - YYYY-MM-DD
 * @param {number} params.cutoffHour - UTC hour for decision cutoff
 * @param {number} params.cutoffMinute - UTC minute for decision cutoff
 */
export const fetchAccuracy = ({ dateFrom, dateTo, cutoffHour, cutoffMinute }) =>
  api.get('/api/accuracy', {
    params: {
      date_from: dateFrom,
      date_to: dateTo,
      cutoff_hour: cutoffHour,
      cutoff_minute: cutoffMinute,
    },
  })


export const fetchLatestForecasts = ({ dateFrom, dateTo, cutoffHour, cutoffMinute }) =>
  api.get('/api/forecasts/latest', {
    params: {
      date_from: dateFrom,
      date_to: dateTo,
      cutoff_hour: cutoffHour,
      cutoff_minute: cutoffMinute,
    },
  })


export const fetchActuals = ({ dateFrom, dateTo }) =>
  api.get('/api/actuals', {
    params: { date_from: dateFrom, date_to: dateTo },
  })


export const buildCsvUrl = ({ dateFrom, dateTo, cutoffHour, cutoffMinute }) => {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    cutoff_hour: cutoffHour,
    cutoff_minute: cutoffMinute,
  })
  return `${BASE_URL}/api/accuracy/csv?${params}`
}
