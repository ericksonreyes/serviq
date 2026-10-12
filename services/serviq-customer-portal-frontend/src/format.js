// Display helpers shared by the customer screens.

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
