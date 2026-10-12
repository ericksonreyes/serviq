export const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600'
// Custom chevron — the native arrow ignores padding on some engines (Safari
// pins it to the border) and px->pr overrides are order-sensitive in v4.
export const select =
  'w-full appearance-none rounded-lg border border-slate-300 bg-white bg-no-repeat pl-3 pr-9 py-2 text-sm focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600 [background-image:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%208l4%204%204-4%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E)] [background-position:right_0.75rem_center] [background-size:0.875rem]'
export const label = 'block text-sm font-medium text-slate-700'
export const btn =
  'rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50'
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
  teal: 'bg-violet-100 text-violet-800',
}

export function Badge({ tone = 'slate', children }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium ${TONES[tone] || TONES.slate}`}>
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
