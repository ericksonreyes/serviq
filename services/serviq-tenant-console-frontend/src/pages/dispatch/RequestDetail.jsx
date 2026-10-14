import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, ErrorBox, Loading, Notice, PageHead, StatusBadge, btn, btnDanger, fmtDate, label, link } from '../../components/ui'

// Dedicated request page — review the customer + location, check eligible
// agents, convert to a job, or cancel. Full page per LAYOUT.MD (dense
// action surfaces graduate from side panes to routes).
export default function RequestDetail() {
  const { requestId } = useParams()
  const { token } = useAuth()
  const tenant = useTenant()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [agents, setAgents] = useState(null)

  const { data, error, loading, reload } = useLoader(async () => {
    const [reqRes, services] = await Promise.all([
      api.request(token, tenant, requestId),
      api.services(token, tenant).catch(() => null),
    ])
    const r = reqRes.data ?? reqRes
    // Converted requests continue as jobs — resolve the linked job so the
    // dispatcher can jump straight to it.
    const jobEnv = r.status === 'converted'
      ? await api.jobs(token, tenant, `?request_id=${requestId}`).catch(() => null)
      : null
    // /services returns {data: {services: [...], areas: [...]}} — map ids to names.
    const svcBody = services?.data ?? services ?? {}
    const svcRows = Array.isArray(svcBody) ? svcBody : (svcBody.services ?? [])
    return {
      request: r,
      linkedJob: rows(jobEnv ?? {})[0],
      svcNames: Object.fromEntries(svcRows.map((s) => [s.id, s.name])),
    }
  }, [token, tenant, requestId])

  const act = async (fn, msg) => {
    setBusy(true)
    setErr(null)
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

  const findAgents = async () => {
    setErr(null)
    try {
      setAgents(rows(await api.eligibleAgents(token, tenant)))
    } catch (e) {
      setErr(e.message)
    }
  }

  if (loading) return <div className="space-y-4"><PageHead title="Request detail" /><Loading /></div>
  if (error) return <div className="space-y-4"><PageHead title="Request detail" /><ErrorBox error={error} /></div>

  const r = data.request
  const { svcNames, linkedJob } = data
  const addr = r.customer?.address || r.details?.address || {}

  return (
    <div className="space-y-4">
      <PageHead
        title={`Request — ${r.customer?.name || 'Customer'}`}
        desc={`${svcNames?.[r.service_id] || r.service_id || 'Service'} · submitted ${fmtDate(r.created_at)}`}
      />
      <Link to="/dispatch/requests" className={link}>← Back to requests</Link>
      <Notice>{ok}</Notice>
      <ErrorBox error={err} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Request detail">
          <dl className="space-y-2 text-sm">
            <Row k="Customer" v={r.customer?.name} />
            <Row k="Contact" v={[r.customer?.contact?.phone, r.customer?.contact?.email].filter(Boolean).join(' · ') || '—'} />
            <Row k="Location" v={[addr.line1, addr.barangay, addr.city].filter(Boolean).join(', ') || '—'} />
            <Row k="Service" v={svcNames?.[r.service_id] || r.service_id || '—'} />
            <Row k="Preferred schedule" v={r.details?.preferred_date || r.details?.scheduled_for || '—'} />
            <Row k="Notes" v={r.details?.notes || r.details?.description || '—'} />
            {r.feedback && <Row k="Customer feedback" v={`${'★'.repeat(r.feedback.rating || 0)} ${r.feedback.comment || ''}`} />}
            <Row k="Status" v={<StatusBadge value={r.status} />} />
            <Row k="Submitted" v={fmtDate(r.created_at)} />
          </dl>
        </Card>

        <Card title="Actions">
          <div className="space-y-2">
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
            <div className="flex flex-wrap gap-3">
              {(r.status === 'submitted' || r.status === 'reviewed') && (
                <button onClick={findAgents} disabled={busy} className={btn}>Check available agents</button>
              )}
              {linkedJob && (
                <Link to={`/dispatch/jobs/${linkedJob.id}`} className={btn}>View job →</Link>
              )}
              {(r.status === 'submitted' || r.status === 'reviewed') && (
                <button onClick={() => act(() => api.convertRequest(token, tenant, requestId), 'Job created — hand-off to job management emitted.')} disabled={busy} className={btn}>
                  Convert to job
                </button>
              )}
              {r.status !== 'converted' && r.status !== 'cancelled' && (
                <button onClick={() => act(() => api.cancelRequest(token, tenant, requestId), 'Request cancelled.')} disabled={busy} className={btnDanger}>
                  Cancel request
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

const Row = ({ k, v, mono }) => (
  <div className="flex justify-between gap-4">
    <dt className="shrink-0 text-slate-500">{k}</dt>
    <dd className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>{v ?? '—'}</dd>
  </div>
)
