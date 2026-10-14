import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, StatusBadge, btn, btnGhost, input, label, money } from '../../components/ui'

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// Service catalog — list for scanning; edit, workflow steps, and pricing
// live on /admin/services/:serviceId.
export default function Services() {
  const { token } = useAuth()
  const tenant = useTenant()
  const navigate = useNavigate()
  const { data: services, error, loading, reload } = useLoader(
    async () => rows(await api.services(token, tenant)), [token, tenant],
  )
  // List-first: the create form swaps in over the list via its CTA (LAYOUT.MD).
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <PageHead title="Service catalog" desc="What you sell — services, pricing, and workflow steps." />
      <ErrorBox error={error} />
      {adding ? (
        <NewService token={token} tenant={tenant} onDone={() => { setAdding(false); reload() }} onCancel={() => setAdding(false)} />
      ) : (
        <Card title="Services" actions={<button className={btn} onClick={() => setAdding(true)}>New service</button>}>
          {loading ? <Loading /> : !services || services.length === 0 ? <Empty /> : (
            <ul className="divide-y divide-slate-100">
              {services.map((s) => (
                <li key={s.id}>
                  <button onClick={() => navigate(`/admin/services/${s.id}`)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
                    <span>
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{(s.workflow_steps || []).length} steps</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm">{money(s.price_cents, s.currency)}</span>
                      <StatusBadge value={s.active === false ? 'inactive' : 'active'} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

function NewService({ token, tenant, onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', description: '', price: '', estimated_minutes: '', required_skills: '', service_areas: '', steps: 'Booked, Serviced' })
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
      await api.createService(token, {
        tenant_id: tenant,
        name: form.name,
        description: form.description || undefined,
        price_cents: form.price ? Math.round(Number(form.price) * 100) : undefined,
        currency: 'PHP',
        estimated_minutes: Number(form.estimated_minutes) || undefined,
        required_skills: csv(form.required_skills),
        service_areas: csv(form.service_areas),
        steps: csv(form.steps).map((name) => ({ name })),
      })
      setOk(`Service ${form.name} created.`)
      setForm({ name: '', description: '', price: '', estimated_minutes: '', required_skills: '', service_areas: '', steps: 'Booked, Serviced' })
      onDone()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="New service type">
      <Notice>{ok}</Notice>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={set('name')} /></div>
        <div><label className={label}>Description</label><input className={input} value={form.description} onChange={set('description')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Base price (PHP)</label><input className={input} type="number" min={0} step={0.01} value={form.price} onChange={set('price')} /></div>
          <div><label className={label}>Est. minutes</label><input className={input} type="number" min={1} value={form.estimated_minutes} onChange={set('estimated_minutes')} /></div>
        </div>
        <div><label className={label}>Required skills</label><input className={input} placeholder="comma-separated" value={form.required_skills} onChange={set('required_skills')} /></div>
        <div><label className={label}>Service areas</label><input className={input} placeholder="comma-separated" value={form.service_areas} onChange={set('service_areas')} /></div>
        <div><label className={label}>Workflow steps</label><input className={input} placeholder="comma-separated" value={form.steps} onChange={set('steps')} /></div>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btn}>{busy ? 'Creating…' : 'Create service'}</button>
          <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </Card>
  )
}
