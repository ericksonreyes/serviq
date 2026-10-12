import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, Pager, StatusBadge, btn, btnDanger, btnGhost, fmtDate, input, label, select } from '../../components/ui'

// Jobs monitor — active jobs with assign/reassign (advisory recommendations
// from dispatch), reschedule, and cancel.
export default function Jobs() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [params] = useSearchParams()
  const [sel, setSel] = useState(params.get('job'))
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)
  // Job rows carry ids only — customers/services/agents are fetched to
  // render names instead of raw UUIDs.
  const { data, error, loading, reload } = useLoader(async () => {
    const [jobs, executions, customers, services, agents] = await Promise.all([
      api.jobs(token, tenant, showAll ? '' : '?status=open', page),
      api.executions(token, tenant).catch(() => []),
      api.customers(token, tenant).catch(() => []),
      api.services(token, tenant).catch(() => []),
      api.agents(token, tenant).catch(() => []),
    ])
    const byId = (list) => Object.fromEntries(rows(list).map((x) => [x.id, x.name]))
    // /services returns {data: {services: [...], areas: [...]}}, not a row list.
    const svcBody = services?.data ?? services ?? {}
    const serviceRows = Array.isArray(svcBody) ? svcBody : (svcBody.services ?? [])
    return {
      jobs: rows(jobs), jobsMeta: jobs, executions: rows(executions),
      names: { customers: byId(customers), services: byId(serviceRows), agents: byId(agents) },
    }
  }, [token, tenant, page, showAll])

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
      <div className={`grid grid-cols-1 gap-4 ${sel ? 'xl:grid-cols-2' : ''}`}>
        <Card title={showAll ? 'All jobs' : 'Active jobs'}>
          <Pager meta={data?.jobsMeta} onPage={setPage} top />
          {loading ? <Loading /> : jobs.length === 0 ? <Empty text="No active jobs." /> : (
            <ul className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button onClick={() => setSel(j.id)} className={`flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50 ${sel === j.id ? 'bg-violet-50' : ''}`}>
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
        {sel && (
          <JobDetail key={sel} jobId={sel} token={token} tenant={tenant} names={names} executions={data?.executions ?? []} onDone={reload} />
        )}
      </div>
    </div>
  )
}

function JobDetail({ jobId, token, tenant, names, executions, onDone }) {
  const { data: job, error, loading, reload: reloadJob } = useLoader(async () => {
    const res = await api.job(token, tenant, jobId)
    return res.data ?? res
  }, [token, tenant, jobId])
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recs, setRecs] = useState(null)
  const [agents, setAgents] = useState(null)
  const [agentId, setAgentId] = useState('')
  const [when, setWhen] = useState('')

  const run = async (fn, msg) => {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await fn()
      setOk(msg)
      onDone()
      reloadJob()
    } catch (e) {
      setErr(e.message)
      // Failures are usually stale state (e.g. auto-assign won the race) — refresh.
      onDone()
      reloadJob()
    } finally {
      setBusy(false)
    }
  }

  const recommend = async () => {
    setErr(null)
    try {
      setRecs(rows(await api.dispatchRecommend(token, tenant, jobId)))
    } catch (e) {
      setRecs(null)
      setErr(e.message)
    }
  }

  const loadAgents = async () => {
    setErr(null)
    try {
      setAgents(rows(await api.eligibleAgents(token, tenant)))
    } catch (e) {
      setErr(e.message)
    }
  }

  const exec = executions.filter((x) => x.job_id === jobId)

  if (loading) return <Card title="Job detail"><Loading /></Card>
  if (error) return <Card title="Job detail"><ErrorBox error={error} /></Card>
  const j = job?.job ?? job

  // Past 'assigned' the agent has committed (accepted/en route/working) —
  // reassignment is a cancel flow, so the section hides entirely.
  const assignable = !['accepted', 'en_route', 'started', 'in_progress', 'completed', 'cancelled'].includes(j.status)
  const assign = (id) => run(
    () => j.status === 'assigned'
      ? api.dispatchReassign(token, tenant, { job_id: jobId, agent_id: id })
      : api.dispatchAssign(token, tenant, { job_id: jobId, agent_id: id }),
    j.status === 'assigned' ? 'Agent reassigned.' : 'Agent assigned.',
  )

  return (
    <Card title="Job detail">
      <Notice>{ok}</Notice>
      <ErrorBox error={err} />
      <dl className="space-y-2 text-sm">
        <Row k="Job" v={j.id} mono />
        <Row k="Customer" v={names.customers[j.customer_id] || j.customer_id || '—'} />
        <Row k="Status" v={<StatusBadge value={j.status} />} />
        <Row k="Scheduled" v={fmtDate(j.scheduled_for)} />
        <Row k="Assigned agent" v={j.assigned_agent_id ? (names.agents[j.assigned_agent_id] || j.assigned_agent_id) : '—'} />
        <Row
          k="Request"
          v={j.request_id ? <Link to={`/dispatch/requests?request=${j.request_id}`} className="text-violet-700 hover:underline">{`${j.request_id.slice(0, 8)}…`}</Link> : '—'}
          mono
        />
        <Row k="Service" v={names.services[j.service_id] || j.service_id || '—'} />
      </dl>
      {(j.workflow_instance || []).length > 0 && (
        <div className="mt-3">
          <p className={label}>Workflow</p>
          <ol className="mt-1 flex flex-wrap gap-1">
            {j.workflow_instance.map((s, i) => (
              <li key={i} className={`rounded-full px-2.5 py-0.5 text-sm ${s.state === 'done' ? 'bg-green-100 text-green-800' : s.state === 'in_progress' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600'}`}>
                {s.name}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
        {(j.status === 'requested' || j.status === 'confirmed') && (
          <div>
            <p className={label}>Lifecycle</p>
            <p className="mt-1 text-xs text-slate-500">
              {j.status === 'requested'
                ? 'Confirm the appointment with the customer, then release the job for assignment.'
                : 'Confirmed — release the job so dispatch can assign an agent.'}
            </p>
            <div className="mt-1 flex gap-3">
              {j.status === 'requested' && (
                <button onClick={() => run(() => api.confirmJob(token, tenant, jobId), 'Job confirmed.')} disabled={busy} className={btn}>
                  Confirm job
                </button>
              )}
              {j.status === 'confirmed' && (
                <button onClick={() => run(() => api.readyJob(token, tenant, jobId), 'Released for assignment.')} disabled={busy} className={btn}>
                  Mark ready for assignment
                </button>
              )}
            </div>
          </div>
        )}

        {assignable && <div>
          <p className={label}>{j.status === 'assigned' ? 'Reassign service agent' : 'Assign service agent'}</p>
          <div className="mt-1 flex gap-3">
            <button onClick={recommend} className={btnGhost}>Get recommendations</button>
            <button onClick={loadAgents} className={btnGhost}>Browse eligible agents</button>
          </div>
          {recs && (
            <ul className="mt-2 space-y-1 rounded-lg border border-slate-200 p-2">
              {recs.length === 0 && <li className="text-sm text-slate-400">No recommendations.</li>}
              {recs.map((r) => (
                <li key={r.agent_id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium">{r.name || r.agent_id}</span>
                    <span className="ml-2 text-xs text-slate-400">score {r.score}{(r.reasons || []).length ? ` — ${r.reasons.join('; ')}` : ''}</span>
                  </span>
                  <button onClick={() => assign(r.agent_id)} disabled={busy} className={btn}>Assign</button>
                </li>
              ))}
            </ul>
          )}
          {agents && (
            <div className="mt-2 flex gap-2">
              <select className={select} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">Pick an agent…</option>
                {agents.map((a) => <option key={a.id} value={a.agent_id || a.id}>{a.name}</option>)}
              </select>
              <button onClick={() => assign(agentId)} disabled={busy || !agentId} className={btn}>Assign</button>
            </div>
          )}
        </div>}

        <div>
          <p className={label}>Reschedule</p>
          <div className="mt-1 flex gap-2">
            <input type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
            <button onClick={() => run(() => api.rescheduleJob(token, tenant, jobId, new Date(when).toISOString()), 'Rescheduled.')} disabled={busy || !when} className={btn}>
              Save
            </button>
          </div>
        </div>

        {exec.length > 0 && (
          <div>
            <p className={label}>Field execution</p>
            <ul className="mt-1 space-y-1 text-sm">
              {exec.map((x) => (
                <li key={x.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                  <span className="font-mono text-xs">{x.id.slice(0, 8)}…</span>
                  <StatusBadge value={x.status} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={() => run(() => api.cancelJob(token, tenant, jobId), 'Job cancelled.')} disabled={busy} className={btnDanger}>Cancel job</button>
        </div>
      </div>
    </Card>
  )
}

const Row = ({ k, v, mono }) => (
  <div className="flex justify-between gap-4">
    <dt className="shrink-0 text-slate-500">{k}</dt>
    <dd className={`text-right ${mono ? 'font-mono text-xs break-all' : ''}`}>{v ?? '—'}</dd>
  </div>
)
