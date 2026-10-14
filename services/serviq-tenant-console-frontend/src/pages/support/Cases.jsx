import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import ChatPanel from '../../components/ChatPanel'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, Pager, StatusBadge, btn, btnGhost, input, label, fmtDate, selectCompact } from '../../components/ui'

const STATUSES = ['', 'open', 'in_progress', 'escalated', 'resolved']

// Support desk — review and respond to complaints/cases, escalate, and
// record refund decisions on cases tied to invoices.
export default function Cases() {
  const { token } = useAuth()
  const tenant = useTenant()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const { data, error, loading, reload } = useLoader(
    async () => api.cases(token, tenant, status, page), [token, tenant, status, page],
  )
  const list = rows(data)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHead title="Support cases" desc="Customer complaints and escalations — select a case for notes, status, and refund decisions." />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={selectCompact}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'all statuses'}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      {creating ? (
        <OpenCase token={token} onDone={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
      ) : (
        <Card title="Cases" actions={<button className={btn} onClick={() => setCreating(true)}>New case</button>}>
          <Pager meta={data} onPage={setPage} top />
          {loading ? <Loading /> : list.length === 0 ? <Empty text="No cases." /> : (
            <ul className="divide-y divide-slate-100">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => navigate(`/support/cases/${c.id}`)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
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
          <Pager meta={data} onPage={setPage} />
        </Card>
      )}
      <ChatPanel profile="support" title="Support assistant" />
    </div>
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Case intake — support staff log a complaint on the customer's behalf
// (phone, email, walk-in); linking the invoice enables a refund decision.
function OpenCase({ token, onDone, onCancel }) {
  const blank = { subject: '', invoice_id: '', job_id: '', details: '' }
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    setOk(null)
    const bad = ['invoice_id', 'job_id'].find((k) => form[k].trim() && !UUID.test(form[k].trim()))
    if (bad) { setErr(`${bad === 'invoice_id' ? 'Invoice' : 'Job'} id must be a full UUID.`); return }
    setBusy(true)
    try {
      await api.openCase(token, {
        subject: form.subject.trim(),
        invoice_id: form.invoice_id.trim() || undefined,
        job_id: form.job_id.trim() || undefined,
        details: form.details.trim() || undefined,
      })
      setOk(`Case "${form.subject.trim()}" opened.`)
      setForm(blank)
      onDone()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Open a case">
      <Notice>{ok}</Notice>
        <form onSubmit={submit} className="space-y-3">
          <ErrorBox error={err} />
          <div><label className={label} htmlFor="case-subject">Subject</label><input id="case-subject" className={input} required maxLength={255} value={form.subject} onChange={set('subject')} /></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><label className={label} htmlFor="case-invoice">Invoice id (optional)</label><input id="case-invoice" className={input} placeholder="Needed for a refund decision" value={form.invoice_id} onChange={set('invoice_id')} /></div>
            <div><label className={label} htmlFor="case-job">Job id (optional)</label><input id="case-job" className={input} value={form.job_id} onChange={set('job_id')} /></div>
          </div>
          <div><label className={label} htmlFor="case-details">Details</label><textarea id="case-details" className={input} rows={2} value={form.details} onChange={set('details')} /></div>
          <div className="flex gap-3">
            <button type="submit" disabled={busy || !form.subject.trim()} className={btn}>{busy ? 'Opening…' : 'Open case'}</button>
            <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
          </div>
        </form>
    </Card>
  )
}

