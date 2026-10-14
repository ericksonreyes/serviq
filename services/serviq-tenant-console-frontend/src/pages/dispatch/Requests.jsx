import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, StatusBadge, fmtDate, selectCompact, statusLabel } from '../../components/ui'

const STATUSES = ['', 'submitted', 'reviewed', 'converted', 'cancelled']

// Incoming service requests — list for triage. Detail (customer, location,
// conversion, cancellation) lives on /dispatch/requests/:requestId.
export default function Requests() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading } = useLoader(
    async () => api.requests(token, tenant, status, page),
    [token, tenant, status, page],
  )
  const list = rows(data)
  // Stale deep links: /dispatch/requests?request=<id> → canonical page.
  const deepLink = params.get('request')
  if (deepLink) return <Navigate to={`/dispatch/requests/${deepLink}`} replace />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHead title="Service requests" desc="Inbound customer asks — select one to review, convert to a job, or cancel." />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={selectCompact}>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s) || 'all statuses'}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />
      <Card title="Requests">
        <Pager meta={data} onPage={setPage} top />
        {loading ? <Loading /> : list.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-slate-100">
            {list.map((r) => (
              <li key={r.id}>
                <button onClick={() => navigate(`/dispatch/requests/${r.id}`)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
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
        <Pager meta={data} onPage={setPage} />
      </Card>
    </div>
  )
}
