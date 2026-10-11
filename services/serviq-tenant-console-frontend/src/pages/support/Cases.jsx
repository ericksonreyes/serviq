import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import ChatPanel from '../../components/ChatPanel'
import { Card, Empty, ErrorBox, Loading, Notice, StatusBadge, btn, btnGhost, input, label, fmtDate } from '../../components/ui'

const STATUSES = ['', 'open', 'in_progress', 'escalated', 'resolved']
const TRANSITIONS = ['open', 'in_progress', 'escalated', 'resolved']

// Support desk — review and respond to complaints/cases, escalate, and
// record refund decisions on cases tied to invoices.
export default function Cases() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [status, setStatus] = useState('')
  const [sel, setSel] = useState(null)
  const { data: list, error, loading, reload } = useLoader(
    async () => rows(await api.cases(token, tenant, status)), [token, tenant, status],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Support cases</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'all statuses'}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Cases">
          {loading ? <Loading /> : !list || list.length === 0 ? <Empty text="No cases." /> : (
            <ul className="divide-y divide-slate-100">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setSel(c)} className={`flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50 ${sel?.id === c.id ? 'bg-teal-50' : ''}`}>
                    <span>
                      <span className="block text-sm font-medium">{c.subject}</span>
                      <span className="block text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                    </span>
                    <StatusBadge value={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {sel ? <CaseDetail key={sel.id} id={sel.id} token={token} tenant={tenant} onDone={reload} /> : (
          <Card title="Case detail"><Empty text="Select a case." /></Card>
        )}
      </div>
      <ChatPanel profile="support" title="Support assistant" />
    </div>
  )
}

function CaseDetail({ id, token, tenant, onDone }) {
  const { data, error, loading, reload } = useLoader(async () => {
    const res = await api.caseDetail(token, tenant, id)
    return res.data ?? res
  }, [token, tenant, id])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const run = async (fn, msg) => {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await fn()
      setOk(msg)
      reload()
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Card title="Case detail"><Loading /></Card>
  if (error) return <Card title="Case detail"><ErrorBox error={error} /></Card>
  const c = data?.case ?? data
  const notes = data?.notes ?? c?.notes ?? []

  return (
    <Card title="Case detail">
      <Notice>{ok}</Notice>
      <ErrorBox error={err} />
      <dl className="space-y-2 text-sm">
        <Row k="Subject" v={c.subject} />
        <Row k="Status" v={<StatusBadge value={c.status} />} />
        <Row k="Invoice" v={c.invoice_id || '—'} mono />
        <Row k="Job" v={c.job_id || '—'} mono />
        <Row k="Customer" v={c.customer_id || '—'} mono />
        <Row k="Opened" v={fmtDate(c.created_at)} />
        {c.details && <Row k="Details" v={typeof c.details === 'string' ? c.details : JSON.stringify(c.details)} />}
      </dl>

      <div className="mt-3">
        <p className={label}>Status</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {TRANSITIONS.map((s) => (
            <button key={s} onClick={() => run(() => api.setCaseStatus(token, tenant, id, s), `Case marked ${s.replace('_', ' ')}.`)} disabled={busy || c.status === s} className={c.status === s ? btn : btnGhost}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className={label}>Notes & replies</p>
        <ul className="mt-1 max-h-40 space-y-1.5 overflow-y-auto">
          {notes.length === 0 && <li className="text-sm text-slate-400">No notes yet.</li>}
          {notes.map((n, i) => (
            <li key={n.id ?? i} className="rounded bg-slate-50 px-2 py-1.5 text-sm">
              {n.body}
              <span className="ml-2 text-xs text-slate-400">{fmtDate(n.created_at)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input className={input} placeholder="Write a reply or internal note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={() => run(() => api.addCaseNote(token, tenant, id, note), 'Note added.').then(() => setNote(''))} disabled={busy || !note.trim()} className={btn}>Post</button>
        </div>
      </div>

      <RefundDecision c={c} caseId={id} token={token} tenant={tenant} onRun={run} busy={busy} />
    </Card>
  )
}

function RefundDecision({ c, caseId, token, tenant, onRun, busy }) {
  const [form, setForm] = useState({ decision: 'approved', amount: '', reason: '' })
  if (!c.invoice_id || c.status === 'resolved') return null
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className={label}>Refund decision</p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <select className={input} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>
          <option value="approved">Approve refund</option>
          <option value="denied">Deny refund</option>
        </select>
        {form.decision === 'approved' && (
          <input className={`${input} w-36`} type="number" min={0} step="0.01" placeholder="Amount (PHP)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        )}
        <input className={`${input} flex-1`} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button
          disabled={busy}
          className={btn}
          onClick={() => onRun(
            () => api.refundDecision(token, tenant, caseId, {
              decision: form.decision,
              amount_cents: form.amount ? Math.round(Number(form.amount) * 100) : undefined,
              reason: form.reason || undefined,
            }),
            'Refund decision recorded — Billing executes approved refunds.',
          )}
        >
          Record decision
        </button>
      </div>
    </div>
  )
}

const Row = ({ k, v, mono }) => (
  <div className="flex justify-between gap-4">
    <dt className="shrink-0 text-slate-500">{k}</dt>
    <dd className={`text-right ${mono ? 'font-mono text-xs break-all' : ''}`}>{v ?? '—'}</dd>
  </div>
)
