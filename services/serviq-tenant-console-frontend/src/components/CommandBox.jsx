import { useState } from 'react'
import { api } from '../api'
import { useAuth, useTenant } from '../auth'
import { input } from './ui'

// Dispatcher chatbot = a natural-language command box (AGENT_PROFILES.MD):
// a power-user shortcut, not a transcript. Tool results render as state
// summaries, the reply as the command outcome.
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
    <div className="rounded-xl bg-slate-900 p-4 text-white shadow">
      <form onSubmit={submit} className="flex gap-2">
        <input
          className={`${input} border-slate-600 bg-slate-800 text-white placeholder-slate-400`}
          placeholder='Command — e.g. "find available agents tomorrow", "recommend an agent for this job"'
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold hover:bg-teal-500 disabled:opacity-50">
          {busy ? 'Running…' : 'Run'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {last && (
        <div className="mt-3 rounded-lg bg-slate-800 p-3 text-sm">
          <p className="text-slate-100">{last.reply}</p>
          {(last.tool_calls || []).length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-slate-700 pt-2">
              {last.tool_calls.map((c, i) => (
                <li key={i} className="text-slate-300">
                  <span className="mr-2 rounded bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-teal-300">{c.tool}</span>
                  {c.summary}
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
