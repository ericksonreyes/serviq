import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, StatusBadge, fmtDate } from '../../components/ui'

// Jobs monitor — the list is a directory; each row opens the dedicated
// job page (/dispatch/jobs/:jobId) where the dispatch actions live.
export default function Jobs() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)
  // Job rows carry ids only — customers/services/agents are fetched to
  // render names instead of raw UUIDs.
  const { data, error, loading } = useLoader(async () => {
    const [jobs, customers, services, agents] = await Promise.all([
      api.jobs(token, tenant, showAll ? '' : '?status=open', page),
      api.customers(token, tenant).catch(() => []),
      api.services(token, tenant).catch(() => []),
      api.agents(token, tenant).catch(() => []),
    ])
    const byId = (list) => Object.fromEntries(rows(list).map((x) => [x.id, x.name]))
    // /services returns {data: {services: [...], areas: [...]}}, not a row list.
    const svcBody = services?.data ?? services ?? {}
    const serviceRows = Array.isArray(svcBody) ? svcBody : (svcBody.services ?? [])
    return {
      jobs: rows(jobs), jobsMeta: jobs,
      names: { customers: byId(customers), services: byId(serviceRows), agents: byId(agents) },
    }
  }, [token, tenant, page, showAll])

  // Legacy deep links (?job=<id>) redirect to the dedicated page.
  const deepLink = params.get('job')
  if (deepLink) return <Navigate to={`/dispatch/jobs/${deepLink}`} replace />

  const names = data?.names ?? { customers: {}, services: {}, agents: {} }
  const jobs = data?.jobs ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHead title="Jobs" desc="Scheduled work — confirm appointments, release for assignment, and dispatch agents." />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); setPage(1) }} />
          Show completed/cancelled
        </label>
      </div>
      <ErrorBox error={error} />
      <Card title={showAll ? 'All jobs' : 'Active jobs'}>
        <Pager meta={data?.jobsMeta} onPage={setPage} top />
        {loading ? <Loading /> : jobs.length === 0 ? <Empty text="No active jobs." /> : (
          <ul className="divide-y divide-slate-100">
            {jobs.map((j) => (
              <li key={j.id}>
                <button onClick={() => navigate(`/dispatch/jobs/${j.id}`)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
                  <span>
                    <span className="block text-sm font-medium">{names.customers[j.customer_id] || `Job ${j.id.slice(0, 8)}…`}</span>
                    <span className="block text-xs text-slate-400">
                      {names.services[j.service_id] || '—'} · {j.scheduled_for ? fmtDate(j.scheduled_for) : 'Unscheduled'} · {j.assigned_agent_id ? (names.agents[j.assigned_agent_id] || 'Agent') : 'unassigned'}
                    </span>
                  </span>
                  <StatusBadge value={j.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pager meta={data?.jobsMeta} onPage={setPage} />
      </Card>
    </div>
  )
}
