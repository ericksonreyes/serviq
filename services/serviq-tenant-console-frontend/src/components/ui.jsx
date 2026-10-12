// Shared dense-console primitives — one interaction idiom across pages.
export const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600'
export const label = 'block text-xs font-medium uppercase tracking-wide text-slate-500'
export const btn =
  'rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50'
export const btnGhost =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50'
export const btnDanger =
  'rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'

const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  teal: 'bg-teal-100 text-teal-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  violet: 'bg-violet-100 text-violet-800',
}

// Status → tone. Unknown statuses get slate.
const STATUS_TONE = {
  submitted: 'blue', reviewed: 'blue', converted: 'teal', cancelled: 'slate',
  requested: 'blue', confirmed: 'blue', ready_for_assignment: 'amber', offered: 'amber', accepted: 'teal',
  assigned: 'teal', en_route: 'blue', started: 'violet', in_progress: 'violet',
  completed: 'green', rejected: 'red', expired: 'slate', revoked: 'slate',
  issued: 'amber', paid: 'green', remitted: 'green', refunded: 'violet',
  accepted_evidence: 'green', flagged: 'amber', pending_confirmation: 'amber',
  manual_review: 'red', pending: 'amber', approved: 'green', denied: 'red',
  open: 'blue', escalated: 'red', resolved: 'green', decided: 'violet', closed: 'slate',
  active: 'green', inactive: 'slate', settled: 'green', held: 'amber',
}

export function StatusBadge({ value }) {
  const v = String(value ?? 'unknown')
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[STATUS_TONE[v] ?? 'slate']}`}>
      {v.replace(/_/g, ' ')}
    </span>
  )
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`rounded-xl bg-white p-4 shadow ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  const msg = typeof error === 'string' ? error : error.message
  const hint = error?.status === 403
    ? ' — your role may not have permission for this action.'
    : ''
  return <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}{hint}</div>
}

export function Notice({ children }) {
  if (!children) return null
  return <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">{children}</div>
}

export function Loading({ text = 'Loading…' }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>
}

export function Empty({ text = 'Nothing here yet.' }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>
}

export const money = (cents, currency = 'PHP') =>
  cents == null ? '—' : new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(cents / 100)

export const short = (id) => (id ? `${id.slice(0, 8)}…` : '—')

export const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '—')

export function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
}
export function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 text-sm text-slate-700 ${className}`}>{children}</td>
}
