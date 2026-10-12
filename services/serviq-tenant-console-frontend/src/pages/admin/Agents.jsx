import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, StatusBadge, btn, btnDanger, input, label } from '../../components/ui'
import InviteForm from '../../components/InviteForm'

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// Service agent roster — add agents (optionally linked to an IAM user) and
// deactivate them.
export default function Agents() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data: agents, error, loading, reload } = useLoader(
    async () => rows(await api.agents(token, tenant)), [token, tenant],
  )
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
      <h1 className="text-xl font-semibold text-slate-900">Service agents</h1>
      <ErrorBox error={error} />
      <ErrorBox error={err} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Roster">
            {loading ? <Loading /> : !agents || agents.length === 0 ? <Empty /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th>Agent</Th><Th>Skills</Th><Th>Areas</Th><Th>Capacity</Th><Th>Status</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 text-sm font-medium">{a.name}</td>
                      <td className="px-3 py-2 text-sm">{(a.skills || []).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-sm">{(a.service_areas || []).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-sm">{a.capacity ?? '—'}</td>
                      <td className="px-3 py-2"><StatusBadge value={a.status || 'active'} /></td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => toggle(a)} className={a.status === 'active' ? btnDanger : btn}>
                          {a.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {agents.map((a) => (
                  <div key={a.id} className="space-y-1.5 px-1 py-3">
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
                      <button onClick={() => toggle(a)} className={a.status === 'active' ? btnDanger : btn}>
                        {a.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <NewAgent token={token} tenant={tenant} onDone={reload} />
          <InviteForm token={token} tenant={tenant} role="Service Agent" />
        </div>
      </div>
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>

function NewAgent({ token, tenant, onDone }) {
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
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Adding…' : 'Add agent'}</button>
      </form>
    </Card>
  )
}
