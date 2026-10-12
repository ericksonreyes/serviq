import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, Pager, StatusBadge, btn, btnGhost, input, label, link, linkDanger } from '../../components/ui'
import InviteForm from '../../components/InviteForm'

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// Service agent roster — add agents (optionally linked to an IAM user) and
// deactivate them.
export default function Agents() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [page, setPage] = useState(1)
  // List-first: forms swap in over the table via their CTA (LAYOUT.MD).
  const [view, setView] = useState(null) // 'create' | 'invite' | null
  const close = () => setView(null)
  const { data, error, loading, reload } = useLoader(
    async () => api.agents(token, tenant, page), [token, tenant, page],
  )
  const agents = rows(data)
  const [err, setErr] = useState(null)

  const toggle = async (a) => {
    setErr(null)
    try {
      await api.updateAgent(token, tenant, a.id, { status: a.status === 'active' ? 'inactive' : 'active' })
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHead title="Service agents" desc="Field workforce roster — skills, coverage areas, and availability." />
      <ErrorBox error={error} />
      <ErrorBox error={err} />
      {view === 'create' && <NewAgent token={token} tenant={tenant} onDone={() => { close(); reload() }} onCancel={close} />}
      {view === 'invite' && <InviteForm token={token} tenant={tenant} role="Service Agent" onCancel={close} />}
      {view === null && (
      <Card
        title="Roster"
        actions={(
          <div className="flex gap-3">
            <button className={btn} onClick={() => setView('create')}>Add agent</button>
            <button className={btnGhost} onClick={() => setView('invite')}>Invite by email</button>
          </div>
        )}
      >
            <Pager meta={data} onPage={setPage} top />
            {loading ? <Loading /> : agents.length === 0 ? <Empty /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th>Agent</Th><Th>Skills</Th><Th>Areas</Th><Th>Capacity</Th><Th>Status</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((a) => (
                    <AgentRow key={a.id} a={a} token={token} tenant={tenant} onDone={reload} onToggle={toggle} />
                  ))}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {agents.map((a) => (
                  <AgentCard key={a.id} a={a} token={token} tenant={tenant} onDone={reload} onToggle={toggle} />
                ))}
              </div>
              </>
            )}
            <Pager meta={data} onPage={setPage} />
      </Card>
      )}
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>

function AgentRow({ a, token, tenant, onDone, onToggle }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <tr>
        <td className="px-3 py-2 text-sm font-medium">{a.name}</td>
        <td className="px-3 py-2 text-sm">{(a.skills || []).join(', ') || '—'}</td>
        <td className="px-3 py-2 text-sm">{(a.service_areas || []).join(', ') || '—'}</td>
        <td className="px-3 py-2 text-sm">{a.capacity ?? '—'}</td>
        <td className="px-3 py-2"><StatusBadge value={a.status || 'active'} /></td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(!editing)} className={link}>
              {editing ? 'Close' : 'Edit'}
            </button>
            <button onClick={() => onToggle(a)} className={a.status === 'active' ? linkDanger : link}>
              {a.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-3 py-3">
            <EditAgent agent={a} token={token} tenant={tenant} onDone={() => { setEditing(false); onDone() }} />
          </td>
        </tr>
      )}
    </>
  )
}

function AgentCard({ a, token, tenant, onDone, onToggle }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="space-y-1.5 px-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{a.name}</span>
        <StatusBadge value={a.status || 'active'} />
      </div>
      <div className="text-sm text-slate-600">
        {(a.skills || []).join(', ') || '—'}
        {(a.service_areas || []).length > 0 && <span className="text-slate-400"> · {(a.service_areas).join(', ')}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-500">Capacity: {a.capacity ?? '—'}/day</span>
        <div className="flex gap-3">
          <button onClick={() => setEditing(!editing)} className={link}>
            {editing ? 'Close' : 'Edit'}
          </button>
          <button onClick={() => onToggle(a)} className={a.status === 'active' ? linkDanger : link}>
            {a.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
      {editing && (
        <div className="rounded-lg bg-slate-50 p-3">
          <EditAgent agent={a} token={token} tenant={tenant} onDone={() => { setEditing(false); onDone() }} />
        </div>
      )}
    </div>
  )
}

function EditAgent({ agent, token, tenant, onDone }) {
  const [form, setForm] = useState({
    name: agent.name,
    skills: (agent.skills ?? []).join(', '),
    areas: (agent.service_areas ?? []).join(', '),
    capacity: agent.capacity ?? 5,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api.updateAgent(token, tenant, agent.id, {
        name: form.name,
        skills: csv(form.skills),
        service_areas: csv(form.areas),
        capacity: Number(form.capacity) || undefined,
      })
      onDone()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={set('name')} /></div>
        <div><label className={label}>Capacity (jobs/day)</label><input className={input} type="number" min={1} max={50} value={form.capacity} onChange={set('capacity')} /></div>
        <div><label className={label}>Skills (comma-separated)</label><input className={input} value={form.skills} onChange={set('skills')} /></div>
        <div><label className={label}>Service areas (comma-separated)</label><input className={input} value={form.areas} onChange={set('areas')} /></div>
      </div>
      <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save agent'}</button>
    </form>
  )
}

function NewAgent({ token, tenant, onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', user_id: '', skills: '', areas: '', capacity: '5' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.createAgent(token, {
        tenant_id: tenant,
        name: form.name,
        user_id: form.user_id || undefined,
        skills: csv(form.skills),
        service_areas: csv(form.areas),
        capacity: Number(form.capacity) || undefined,
      })
      setOk(`Agent ${form.name} added.`)
      setForm({ name: '', user_id: '', skills: '', areas: '', capacity: '5' })
      onDone()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add service agent">
      <Notice>{ok}</Notice>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={set('name')} /></div>
        <div>
          <label className={label}>IAM user id (optional)</label>
          <input className={input} placeholder="Link the agent to a portal login" value={form.user_id} onChange={set('user_id')} />
        </div>
        <div><label className={label}>Skills (comma-separated)</label><input className={input} placeholder="plumbing, electrical" value={form.skills} onChange={set('skills')} /></div>
        <div><label className={label}>Service areas (comma-separated)</label><input className={input} placeholder="north, downtown" value={form.areas} onChange={set('areas')} /></div>
        <div><label className={label}>Capacity (jobs/day)</label><input className={input} type="number" min={1} max={50} value={form.capacity} onChange={set('capacity')} /></div>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btn}>{busy ? 'Adding…' : 'Add agent'}</button>
          <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </Card>
  )
}
