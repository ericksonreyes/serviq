// Display helpers shared by the agent screens.

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export const money = (cents) => peso.format((cents ?? 0) / 100)

// Address records are JSON: { line1, barangay, city, lat, lng, ... }.
export function addressText(addr) {
  if (!addr) return null
  if (typeof addr === 'string') return addr
  return [addr.line1, addr.line2, addr.barangay, addr.city, addr.province]
    .filter(Boolean).join(', ') || null
}

// Universal maps deep link — opens turn-by-turn navigation on mobile.
export function navigateUrl(addr) {
  if (!addr || typeof addr !== 'object') {
    const text = addressText(addr)
    return text ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}` : null
  }
  const dest = addr.lat && addr.lng ? `${addr.lat},${addr.lng}` : addressText(addr)
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null
}

export const shortId = (id) => (id ? `${id.slice(0, 8)}…` : '')

// Date display policy: long month, never raw ISO or numeric m/d.
// fmtDay for date-only values, fmtDateTime for timestamps.
const DAY_FMT = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
const TS_FMT = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const fmtDay = (v) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
  return y && m && d ? DAY_FMT.format(new Date(y, m - 1, d)) : String(v)
}
export const fmtDateTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : TS_FMT.format(d)
}

export const STATUS_LABELS = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  open: 'Open',
  'in-progress': 'In progress',
  closed: 'Done',
  issued: 'Issued',
  paid: 'Paid',
}

export const STATUS_COLORS = {
  assigned: 'info',
  in_progress: 'warning',
  'in-progress': 'warning',
  completed: 'success',
  cancelled: 'default',
  closed: 'success',
  open: 'default',
}
