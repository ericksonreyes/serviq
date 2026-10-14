import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, ErrorBox, Loading, Notice, PageHead, StatusBadge, btn, btnDanger, btnGhost, fmtDate, input, label, link, select } from '../../components/ui'

// Dedicated job page — dispatch control surface: lifecycle, workflow
// stepper, assign/reassign with advisory recommendations, reschedule,
// field executions, cancel. Full page (not a side pane) since it carries
// the densest action set in the console (LAYOUT.MD).
export default function JobDetail() {
  const { jobId } = useParams()
  const { token } = useAuth()
  const tenant = useTenant()
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recs, setRecs] = useState(null)
  const [agents, setAgents] = useState(null)
  const [agentId, setAgentId] = useState('')
  const [when, setWhen] = useState('')

  // Job rows carry ids only — customers/services/agents are fetched to
  // render names instead of raw UUIDs.
  const { data, error, loading, reload } = useLoader(async () => {
    const [jobRes, executions, customers, services, agentsList] = await Promise.all([
      api.job(token, tenant, jobId),
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
      job: jobRes.data ?? jobRes,
      executions: rows(executions),
      names: { customers: byId(customers), services: byId(serviceRows), agents: byId(agentsList) },
    }
  }, [token, tenant, jobId])

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
      // Failures are usually stale state (e.g. auto-assign won the race) — refresh.
      reload()
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

  if (loading) return <div className="space-y-4"><PageHead title="Job detail" /><Loading /></div>
  if (error) return <div className="space-y-4"><PageHead title="Job detail" /><ErrorBox error={error} /></div>

  const j = data?.job?.job ?? data?.job
  const names = data?.names ?? { customers: {}, services: {}, agents: {} }
  const exec = (data?.executions ?? []).filter((x) => x.job_id === jobId)

  // Dispatchers may reassign on any open job — dispatch-committed,
  // agent-accepted, or mid-flight (ADR-0024). Closed jobs hide the section.
  const assignable = !['completed', 'cancelled'].includes(j.status)
  const assigned = j.assigned_agent_id != null

  // While the job is being worked but no step is marked started, the first
  // unfinished step is the implied current one — keeps the stepper honest
  // about position instead of rendering every step as upcoming.
  const steps = j.workflow_instance ?? []
  const impliedStep = (j.status === 'in_progress' || j.status === 'started')
    && !steps.some((s) => s.state === 'in-progress' || s.state === 'in_progress')
    ? steps.findIndex((s) => s.state !== 'closed' && s.state !== 'done')
    : -1

  const assign = (id) => run(
    () => assigned
      ? api.dispatchReassign(token, tenant, { job_id: jobId, agent_id: id })
      : api.dispatchAssign(token, tenant, { job_id: jobId, agent_id: id }),
    assigned ? 'Agent reassigned — the previous agent is notified.' : 'Agent assigned.',
  )

  return (
    <div className="space-y-4">
      <PageHead
        title={`Job — ${names.customers[j.customer_id] || 'Customer'}`}
        desc={`${names.services[j.service_id] || 'Service removed from catalog'} · ${j.scheduled_for ? fmtDate(j.scheduled_for) : 'Unscheduled'}`}
      />
      <Link to="/dispatch/jobs" className={link}>← Back to jobs</Link>
      <Notice>{ok}</Notice>
      <ErrorBox error={err} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Job detail">
          <dl className="space-y-2 text-sm">
            <Row k="Job" v={j.id} mono />
            <Row k="Customer" v={names.customers[j.customer_id] || <span className="text-slate-400">record removed</span>} />
            <Row k="Status" v={<StatusBadge value={j.status} />} />
            <Row k="Scheduled" v={fmtDate(j.scheduled_for)} />
            <Row k="Assigned agent" v={j.assigned_agent_id ? (names.agents[j.assigned_agent_id] || <span className="text-slate-400">agent removed</span>) : '—'} />
            <Row
              k="Request"
              v={j.request_id ? <Link to={`/dispatch/requests/${j.request_id}`} className="text-violet-700 hover:underline">{`${j.request_id.slice(0, 8)}…`}</Link> : '—'}
              mono
            />
            <Row k="Service" v={names.services[j.service_id] || <span className="text-slate-400">removed from catalog</span>} />
          </dl>
          {steps.length > 0 && (
            <div className="mt-3">
              <p className={label}>Workflow</p>
              {/* Stepper: states are open → in-progress → closed (JobStore).
                  Progress is carried by icon + fill, not hue alone — done gets
                  a check glyph, current gets ring + weight, upcoming steps are
                  bordered and unfilled (LAYOUT.MD: progress without color). */}
              <ol className="mt-1 flex flex-wrap items-center gap-y-1.5">
                {steps.map((s, i) => {
                  const done = s.state === 'closed' || s.state === 'done'
                  const active = s.state === 'in-progress' || s.state === 'in_progress' || i === impliedStep
                  return (
                    <li key={i} className="flex items-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm ${
                        done ? 'bg-green-100 text-green-800'
                          : active ? 'bg-violet-100 font-medium text-violet-800 ring-1 ring-violet-300'
                          : 'border border-slate-300 text-slate-500'}`}>
                        {done && <span aria-hidden="true">✓</span>}
                        {s.name}
                      </span>
                      {i < steps.length - 1 && (
                        <span className={`mx-1.5 ${done ? 'text-green-600' : 'text-slate-300'}`} aria-hidden="true">→</span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {exec.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className={label}>Field execution</p>
              <ul className="mt-1 space-y-1 text-sm">
                {exec.map((x) => (
                  <li key={x.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                    <span>
                      <span className="font-medium">{names.agents[x.agent_id] || <span className="text-slate-400">agent removed</span>}</span>
                      {x.checked_in_at && <span className="ml-2 text-xs text-slate-400">checked in {fmtDate(x.checked_in_at)}</span>}
                    </span>
                    <StatusBadge value={x.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Actions">
          <div className="space-y-3">
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
              <p className={label}>{assigned ? 'Reassign service agent' : 'Assign service agent'}</p>
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

            {/* Backend 409s once an agent is assigned or work has started —
                hide rather than offer a dead control (NN/g error prevention). */}
            {!assigned && !['in_progress', 'completed', 'cancelled'].includes(j.status) && (
            <div>
              <p className={label}>Reschedule</p>
              <div className="mt-1 flex gap-2">
                <input type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
                <button onClick={() => run(() => api.rescheduleJob(token, tenant, jobId, new Date(when).toISOString()), 'Rescheduled.')} disabled={busy || !when} className={btn}>
                  Save
                </button>
              </div>
            </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => run(() => api.cancelJob(token, tenant, jobId), 'Job cancelled.')} disabled={busy} className={btnDanger}>Cancel job</button>
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
    <dd className={`text-right ${mono ? 'font-mono text-xs break-all' : ''}`}>{v ?? '—'}</dd>
  </div>
)
