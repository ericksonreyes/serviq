import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, ErrorBox, Loading, Notice, PageHead, StatusBadge, btn, btnGhost, input, label, fmtDate, link, select } from '../../components/ui'

const TRANSITIONS = ['open', 'in_progress', 'escalated', 'resolved']

// Dedicated case page — status transitions, the notes/replies thread, and
// the refund decision need a full column, not a split pane (LAYOUT.MD).
export default function CaseDetail() {
  const { caseId } = useParams()
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading, reload } = useLoader(async () => {
    const res = await api.caseDetail(token, tenant, caseId)
    return res.data ?? res
  }, [token, tenant, caseId])
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
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="space-y-4"><PageHead title="Case detail" /><Loading /></div>
  if (error) return <div className="space-y-4"><PageHead title="Case detail" /><ErrorBox error={error} /></div>
  const c = data?.case ?? data
  const notes = data?.notes ?? c?.notes ?? []

  return (
    <div className="space-y-4">
      <PageHead title={`Case — ${c.subject || ''}`} desc={`Opened ${fmtDate(c.created_at)}`} />
      <Link to="/support/cases" className={link}>← Back to cases</Link>
      <Notice>{ok}</Notice>
      <ErrorBox error={err} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Case detail">
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
            <div className="mt-1 flex flex-wrap gap-3">
              {TRANSITIONS.map((s) => (
                <button key={s} onClick={() => run(() => api.setCaseStatus(token, tenant, caseId, s), `Case marked ${s.replace('_', ' ')}.`)} disabled={busy || c.status === s} className={c.status === s ? btn : btnGhost}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Conversation">
          <p className={label}>Notes & replies</p>
          <ul className="mt-1 max-h-72 space-y-1.5 overflow-y-auto">
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
            <button onClick={() => run(() => api.addCaseNote(token, tenant, caseId, note), 'Note added.').then(() => setNote(''))} disabled={busy || !note.trim()} className={btn}>Post</button>
          </div>

          <RefundDecision c={c} caseId={caseId} token={token} tenant={tenant} onRun={run} busy={busy} />
        </Card>
      </div>
    </div>
  )
}

function RefundDecision({ c, caseId, token, tenant, onRun, busy }) {
  const [form, setForm] = useState({ decision: 'approved', amount: '', reason: '' })
  if (!c.invoice_id || c.status === 'resolved') return null
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className={label}>Refund decision</p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <select className={select} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>
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
