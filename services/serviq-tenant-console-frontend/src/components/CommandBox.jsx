import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useTenant } from '../auth'
import { input, StatusBadge, ThinkingLabel } from './ui'

// Dispatcher chatbot = a natural-language command box (AGENT_PROFILES.MD):
// a power-user shortcut, not a transcript. Tool results render as actionable
// rows (deep-linked to the owning page), the reply as the command outcome.
export default function CommandBox() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(null)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.chat(token, 'dispatcher', message.trim(), { tenant_id: tenant })
      setLast(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl bg-indigo-950 p-4 text-white shadow">
      <form onSubmit={submit} className="flex gap-2">
        <input
          className={`${input} border-slate-600 bg-indigo-900 text-white placeholder-slate-400 disabled:opacity-60`}
          placeholder='Command — e.g. "find available agents tomorrow", "recommend an agent for this job"'
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy} className="w-32 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">
          {busy ? <ThinkingLabel /> : 'Run'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {last && (
        <div className="mt-3 rounded-lg bg-indigo-900 p-3 text-sm">
          {(() => {
            const calls = last.tool_calls || []
            // When a call's rows render below, its listing-style summary is
            // redundant — show the reply only if it adds something.
            const redundant = calls.some((c) => c.summary === last.reply && rowsOf(c).length > 0)
            return redundant ? null : <p className="text-slate-100">{last.reply}</p>
          })()}
          {(last.tool_calls || []).length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-slate-700 pt-2">
              {last.tool_calls.map((c, i) => (
                <li key={i} className="text-slate-300">
                  <span className="mr-2 rounded bg-slate-700 px-1.5 py-0.5 font-mono text-sm text-violet-300">{c.tool}</span>
                  {rowsOf(c).length === 0 && c.summary}
                  <ResultRows call={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Ask in plain language — request search, agent search, repair guides, dispatch recommendations, cash turn-in counts, remittance evidence.
      </p>
    </div>
  )
}

const rowsOf = (c) => (Array.isArray(c.data) ? c.data : [])

// Per-tool row → {to, title, sub, status}. `to` makes the row a link.
const ROW_FOR = {
  service_request_search: (r) => ({
    to: `/dispatch/requests?request=${r.id}`,
    title: r.customer?.name || `Request ${String(r.id).slice(0, 8)}…`,
    sub: r.details?.notes || r.details?.description,
    status: r.status,
  }),
  service_agent_search: (a) => ({
    to: '/admin/agents',
    title: a.name,
    sub: (a.skills || []).join(', ') || null,
    status: a.status,
  }),
  dispatch_recommend: (r, c) => ({
    to: c.params?.job_id ? `/dispatch/jobs?job=${c.params.job_id}` : null,
    title: r.name,
    sub: [`score ${r.score}`, ...(r.reasons || [])].filter(Boolean).join(' — '),
  }),
  repair_guide_search: (g) => ({
    title: g.title || 'Untitled guide',
    sub: g.summary || g.description || null,
  }),
}

function ResultRows({ call }) {
  const rows = rowsOf(call)
  if (rows.length === 0) return null
  const map = ROW_FOR[call.tool] || ((r) => ({ title: r.name || r.title || r.id }))
  return (
    <ul className="mt-1.5 space-y-0.5">
      {rows.map((row, i) => {
        const item = map(row, call)
        const inner = (
          <>
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-100">{item.title || '—'}</span>
              {item.sub && <span className="block truncate text-xs text-slate-400">{item.sub}</span>}
            </span>
            {item.status && <StatusBadge value={item.status} />}
          </>
        )
        return (
          <li key={i}>
            {item.to ? (
              <Link to={item.to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-indigo-800">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-3 px-2 py-1.5">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
