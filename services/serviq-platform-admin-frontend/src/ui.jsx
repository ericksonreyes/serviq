export const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600'
export const label = 'block text-sm font-medium text-slate-700'
export const btn =
  'rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50'
export const btnSecondary =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
export const btnDanger =
  'rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50'
export const card = 'rounded-xl bg-white p-5 shadow'
export const th = 'px-4 py-2 text-left font-medium text-slate-500'
export const td = 'border-t border-slate-100 px-4 py-2'

const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  teal: 'bg-teal-100 text-teal-800',
}

export function Badge({ tone = 'slate', children }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone] || TONES.slate}`}>
      {children}
    </span>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
}

export function Empty({ children }) {
  return <p className="text-sm text-slate-500">{children}</p>
}

export const STATUS_TONE = {
  active: 'green',
  pending: 'amber',
  suspended: 'red',
  deactivated: 'slate',
  past_due: 'red',
  canceled: 'slate',
  current: 'green',
  untracked: 'slate',
  enabled: 'green',
  disabled: 'slate',
  resolved: 'green',
}

export function money(cents, currency = 'PHP') {
  if (cents === null || cents === undefined) return '—'
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}
