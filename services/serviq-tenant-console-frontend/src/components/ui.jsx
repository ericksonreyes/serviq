// Shared dense-console primitives — one interaction idiom across pages.
import { useEffect, useState } from 'react'

export const input =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600'
// Custom chevron — native select arrows ignore padding on some engines
// (Safari pins them to the border).
const chevron =
  'appearance-none bg-white bg-no-repeat [background-image:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M6%208l4%204%204-4%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E)] [background-position:right_0.6rem_center] [background-size:0.75rem]'
export const select =
  `w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-sm focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600 ${chevron}`
export const selectCompact =
  `rounded-lg border border-slate-300 pl-2 pr-7 py-1.5 text-sm ${chevron}`
export const label = 'block text-xs font-medium uppercase tracking-wide text-slate-500'
export const btn =
  'rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50'
export const btnGhost =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50'
export const btnDanger =
  'rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'
// Row-action idiom — per-record actions inside table rows / list-row
// cards render as text links (violet normal, red destructive). Real
// buttons stay for detail panes, form footers, and card-level CTAs.
export const link =
  'text-sm font-medium text-violet-700 hover:underline disabled:text-slate-300 disabled:no-underline'
export const linkDanger =
  'text-sm font-medium text-red-700 hover:underline disabled:text-slate-300 disabled:no-underline'

const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  teal: 'bg-violet-100 text-violet-800',
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

// Friendly display names where the domain term reads as jargon — the
// backend keeps 'converted' (handed off to Job Management); the badge and
// filters show the outcome instead.
export const STATUS_LABELS = { converted: 'Job created' }
export const statusLabel = (v) => STATUS_LABELS[v] ?? String(v ?? 'unknown').replace(/_/g, ' ')

export function StatusBadge({ value }) {
  const v = String(value ?? 'unknown')
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-medium ${TONES[STATUS_TONE[v] ?? 'slate']}`}>
      {statusLabel(v)}
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
  return <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">{children}</div>
}

export function Loading({ text = 'Loading…' }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>
}

// Page header idiom — every app page gets a heading plus one line saying
// what the page is for. Sits fine inside a `flex justify-between` row.
export function PageHead({ title, desc }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {desc && <p className="mt-0.5 text-sm text-slate-500">{desc}</p>}
    </div>
  )
}

// AI-augmented surfaces use this while a request is in flight: the host
// input is disabled and this label animates the ellipsis every second.
export function ThinkingLabel({ text = 'Thinking', className = '' }) {
  const [dots, setDots] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d % 3) + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className={className}>{text}<span className="inline-block w-4 text-left">{'.'.repeat(dots)}</span></span>
}

// Laravel pagination controls — the api returns the paginated envelope
// ({data, current_page, last_page, total}); pages pass it straight in.
// Render at the top and bottom of long lists so controls are reachable
// without scrolling.
export function Pager({ meta, onPage, top = false }) {
  if (!meta || !meta.last_page || meta.last_page <= 1) return null
  const btn = 'rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40'
  return (
    <div className={`flex items-center justify-between text-xs text-slate-500 ${top ? 'border-b border-slate-100 pb-3' : 'border-t border-slate-100 pt-3'}`}>
      <span>
        Page {meta.current_page} of {meta.last_page}
        {meta.total != null && ` · ${meta.total} total`}
      </span>
      <div className="flex gap-1.5">
        <button className={btn} disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>
          ← Prev
        </button>
        <button className={btn} disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>
          Next →
        </button>
      </div>
    </div>
  )
}

export function Empty({ text = 'Nothing here yet.' }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>
}

export const money = (cents, currency = 'PHP') =>
  cents == null ? '—' : new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(cents / 100)

export const short = (id) => (id ? `${id.slice(0, 8)}…` : '—')

// Date display policy (LAYOUT.MD): never raw ISO (2026-10-14) or numeric
// m/d strings — the long month makes day/month order unambiguous.
// fmtDay: date-only values (YYYY-MM-DD, parsed locally so no TZ shift).
// fmtMonthDay: recurring values stored as MM-DD (no year).
// fmtDate: full timestamps.
const DAY_FMT = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
const MD_FMT = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric' })
const TS_FMT = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const fmtDay = (v) => {
  if (!v) return '—'
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
  return y && m && d ? DAY_FMT.format(new Date(y, m - 1, d)) : String(v)
}
export const fmtMonthDay = (v) => {
  const [m, d] = String(v).split('-').map(Number)
  return m && d ? MD_FMT.format(new Date(2000, m - 1, d)) : String(v)
}
export const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : TS_FMT.format(d)
}

export function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
}
export function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 text-sm text-slate-700 ${className}`}>{children}</td>
}
