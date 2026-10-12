import { useState } from 'react'
import { api } from '../api'
import { useAuth, useTenant } from '../auth'
import { input } from './ui'

// Customer Support chatbot panel — profile-isolated conversation with the
// AI agent (complaint_manage / refund_manage / refund_process tools).
export default function ChatPanel({ profile = 'support', title = 'Support assistant' }) {
  const { token } = useAuth()
  const tenant = useTenant()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])

  const send = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    const text = message.trim()
    setMessage('')
    setLog((l) => [...l, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await api.chat(token, profile, text, { tenant_id: tenant })
      setLog((l) => [...l, { role: 'agent', text: res.reply, tools: res.tool_calls }])
    } catch (err) {
      setLog((l) => [...l, { role: 'agent', text: `Error: ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-20 rounded-full bg-violet-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-violet-800">
        {title}
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-20 flex h-96 w-80 flex-col rounded-xl bg-white shadow-2xl ring-1 ring-slate-300">
      <div className="flex items-center justify-between rounded-t-xl bg-indigo-950 px-3 py-2 text-white">
        <span className="text-sm font-semibold">{title}</span>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">✕</button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {log.length === 0 && <p className="text-xs text-slate-400">Ask about cases, refunds, or escalations.</p>}
        {log.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${m.role === 'user' ? 'ml-auto bg-violet-700 text-white' : 'bg-slate-100 text-slate-800'}`}>
            <p>{m.text}</p>
            {(m.tools || []).map((c, j) => (
              <p key={j} className="mt-1 text-xs text-slate-500">
                <span className="font-mono text-violet-700">{c.tool}</span> — {c.summary}
              </p>
            ))}
          </div>
        ))}
        {busy && <p className="text-xs text-slate-400">Thinking…</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-2">
        <input className={input} placeholder="Message…" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button type="submit" disabled={busy} className="rounded-lg bg-violet-700 px-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">Send</button>
      </form>
    </div>
  )
}
