import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, StatusBadge, btn, btnDanger, fmtDate, selectCompact } from '../../components/ui'

const STATUSES = ['', 'submitted', 'reviewed', 'converted', 'cancelled']

// Incoming service requests — review, inspect the customer + location,
// convert to a job, or cancel.
export default function Requests() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('')
  const [sel, setSel] = useState(null)
  const { data: list, error, loading, reload } = useLoader(
    async () => rows(await api.requests(token, tenant, status)), [token, tenant, status],
  )
  const want = params.get('request')
  useEffect(() => {
    if (want && list) setSel(list.find((r) => r.id === want) ?? null)
  }, [want, list])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Service requests</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCompact}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'all statuses'}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Requests">
          {loading ? <Loading /> : !list || list.length === 0 ? <Empty /> : (
            <ul className="divide-y divide-slate-100">
              {list.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSel(r)} className={`flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50 ${sel?.id === r.id ? 'bg-violet-50' : ''}`}>
                    <span>
                      <span className="block text-sm font-medium">{r.customer?.name || 'Customer'}</span>
                      <span className="block text-xs text-slate-400">{fmtDate(r.created_at)} · {r.details?.notes || r.details?.description || '—'}</span>
                    </span>
                    <StatusBadge value={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {sel ? <RequestDetail key={sel.id} request={sel} token={token} tenant={tenant} onDone={() => { setSel(null); reload() }} /> : (
          <Card title="Detail"><Empty text="Select a request." /></Card>
        )}
      </div>
    </div>
  )
}

function RequestDetail({ request: r, token, tenant, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [agents, setAgents] = useState(null)

  const act = async (fn, msg) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      setOk(msg)
      setTimeout(onDone, 800)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const addr = r.customer?.address || r.details?.address || {}
  const findAgents = async () => {
    setErr(null)
    try {
      setAgents(rows(await api.eligibleAgents(token, tenant)))
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <Card title="Request detail">
      <Notice>{ok}</Notice>
      <ErrorBox error={err} />
      <dl className="space-y-2 text-sm">
        <Row k="Customer" v={r.customer?.name} />
        <Row k="Contact" v={[r.customer?.contact?.phone, r.customer?.contact?.email].filter(Boolean).join(' · ') || '—'} />
        <Row k="Location" v={[addr.line1, addr.barangay, addr.city].filter(Boolean).join(', ') || '—'} />
        <Row k="Service" v={r.service_id || '—'} mono />
        <Row k="Preferred schedule" v={r.details?.preferred_date || r.details?.scheduled_for || '—'} />
        <Row k="Notes" v={r.details?.notes || r.details?.description || '—'} />
        {r.feedback && <Row k="Customer feedback" v={`${'★'.repeat(r.feedback.rating || 0)} ${r.feedback.comment || ''}`} />}
        <Row k="Status" v={<StatusBadge value={r.status} />} />
        <Row k="Submitted" v={fmtDate(r.created_at)} />
      </dl>
      <div className="mt-4 space-y-2">
        {agents && (
          <div className="rounded-lg border border-slate-200 p-2 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Eligible agents</p>
            {agents.length === 0 ? <p className="text-slate-400">None eligible for this request's requirements.</p> : (
              <ul className="space-y-1">
                {agents.map((a) => <li key={a.id}>{a.name} <span className="text-xs text-slate-400">{(a.skills || []).join(', ')}</span></li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={findAgents} disabled={busy} className={btn}>Check available agents</button>
          {(r.status === 'submitted' || r.status === 'reviewed') && (
            <button onClick={() => act(() => api.convertRequest(token, tenant, r.id), 'Converted — hand-off to job management emitted.')} disabled={busy} className={btn}>
              Convert to job
            </button>
          )}
          {r.status !== 'converted' && r.status !== 'cancelled' && (
            <button onClick={() => act(() => api.cancelRequest(token, tenant, r.id), 'Request cancelled.')} disabled={busy} className={btnDanger}>
              Cancel request
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

const Row = ({ k, v, mono }) => (
  <div className="flex justify-between gap-4">
    <dt className="shrink-0 text-slate-500">{k}</dt>
    <dd className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>{v ?? '—'}</dd>
  </div>
)
