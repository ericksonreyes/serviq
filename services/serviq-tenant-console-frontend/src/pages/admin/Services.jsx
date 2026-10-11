import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, StatusBadge, btn, btnGhost, input, label, money } from '../../components/ui'

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// Service catalog — create service types, edit workflow steps, and manage
// per-service pricing.
export default function Services() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data: services, error, loading, reload } = useLoader(
    async () => rows(await api.services(token, tenant)), [token, tenant],
  )
  const [sel, setSel] = useState(null)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Service catalog</h1>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card title="Services">
            {loading ? <Loading /> : !services || services.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-slate-100">
                {services.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setSel(sel?.id === s.id ? null : s)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-slate-50">
                      <span>
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="ml-2 text-xs text-slate-400">{(s.workflow_steps || []).length} steps</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm">{money(s.price_cents, s.currency)}</span>
                        <StatusBadge value={s.active === false ? 'inactive' : 'active'} />
                      </span>
                    </button>
                    {sel?.id === s.id && <ServiceDetail key={s.id} service={s} token={token} tenant={tenant} onDone={reload} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <NewService token={token} tenant={tenant} onDone={reload} />
      </div>
    </div>
  )
}

function ServiceDetail({ service, token, tenant, onDone }) {
  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-3 py-3">
      <EditService service={service} token={token} tenant={tenant} onDone={onDone} />
      <StepsEditor service={service} token={token} tenant={tenant} onDone={onDone} />
      <PricingEditor service={service} token={token} tenant={tenant} />
    </div>
  )
}

function EditService({ service, token, tenant, onDone }) {
  const [form, setForm] = useState({
    name: service.name, description: service.description || '',
    estimated_minutes: service.estimated_minutes || '',
    required_skills: (service.required_skills || []).join(', '),
    service_areas: (service.service_areas || []).join(', '),
    active: service.active !== false,
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api.updateService(token, tenant, service.id, {
        name: form.name,
        description: form.description || null,
        estimated_minutes: Number(form.estimated_minutes) || null,
        required_skills: csv(form.required_skills),
        service_areas: csv(form.service_areas),
        active: form.active,
      })
      setMsg('Saved.')
      onDone()
    } catch (err) {
      setMsg(err.fields ? Object.values(err.fields).flat()[0] : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label}>Name</label><input className={input} value={form.name} onChange={set('name')} required /></div>
        <div><label className={label}>Est. minutes</label><input className={input} type="number" min={1} value={form.estimated_minutes} onChange={set('estimated_minutes')} /></div>
      </div>
      <div><label className={label}>Description</label><input className={input} value={form.description} onChange={set('description')} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label}>Required skills</label><input className={input} value={form.required_skills} onChange={set('required_skills')} /></div>
        <div><label className={label}>Service areas</label><input className={input} value={form.service_areas} onChange={set('service_areas')} /></div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save service'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </form>
  )
}

function StepsEditor({ service, token, tenant, onDone }) {
  const [steps, setSteps] = useState((service.workflow_steps || []).map((s) => ({ name: s.name })))
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSteps(next)
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await api.setServiceSteps(token, tenant, service.id, steps.filter((s) => s.name.trim()))
      setMsg('Workflow saved — applies to new jobs.')
      onDone()
    } catch (err) {
      setMsg(err.fields ? Object.values(err.fields).flat()[0] : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className={label}>Workflow steps</p>
      <ul className="mt-1 space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 text-xs text-slate-400">{i + 1}.</span>
            <input className={input} value={s.name} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { name: e.target.value } : x)))} />
            <button type="button" onClick={() => move(i, -1)} className={btnGhost}>↑</button>
            <button type="button" onClick={() => move(i, 1)} className={btnGhost}>↓</button>
            <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className={btnGhost}>✕</button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => setSteps([...steps, { name: '' }])} className={btnGhost}>+ Step</button>
        <button type="button" onClick={save} disabled={busy || steps.every((s) => !s.name.trim())} className={btn}>{busy ? 'Saving…' : 'Save steps'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  )
}

function PricingEditor({ service, token, tenant }) {
  const [form, setForm] = useState({ base_price: (service.price_cents ?? 0) / 100, currency: service.currency || 'PHP', price_type: 'fixed' })
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  // Load the dedicated pricing record (overrides the catalog's list price).
  useState(() => {
    api.servicePricing(token, tenant, service.id)
      .then((res) => {
        const p = res.data ?? res
        if (p && (p.base_price_cents != null)) {
          setForm({ base_price: p.base_price_cents / 100, currency: p.currency || 'PHP', price_type: p.price_type || 'fixed' })
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api.setServicePricing(token, tenant, service.id, {
        base_price_cents: Math.round(Number(form.base_price) * 100),
        currency: form.currency,
        price_type: form.price_type,
      })
      setMsg('Pricing saved.')
    } catch (err) {
      setMsg(err.fields ? Object.values(err.fields).flat()[0] : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save}>
      <p className={label}>Pricing {loaded ? '' : '(loading…)'} </p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <div><label className="text-xs text-slate-400">Base price</label><input className={input} type="number" min={0} step="0.01" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} /></div>
        <div><label className="text-xs text-slate-400">Currency</label><input className={`${input} w-24`} maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
        <div>
          <label className="text-xs text-slate-400">Type</label>
          <select className={input} value={form.price_type} onChange={(e) => setForm({ ...form, price_type: e.target.value })}>
            <option value="fixed">Fixed</option>
            <option value="hourly">Hourly</option>
            <option value="estimate">Estimate</option>
          </select>
        </div>
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save pricing'}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </form>
  )
}

function NewService({ token, tenant, onDone }) {
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
          <div><label className={label}>Base price (PHP)</label><input className={input} type="number" min={0} step="0.01" value={form.price} onChange={set('price')} /></div>
          <div><label className={label}>Est. minutes</label><input className={input} type="number" min={1} value={form.estimated_minutes} onChange={set('estimated_minutes')} /></div>
        </div>
        <div><label className={label}>Required skills</label><input className={input} placeholder="comma-separated" value={form.required_skills} onChange={set('required_skills')} /></div>
        <div><label className={label}>Service areas</label><input className={input} placeholder="comma-separated" value={form.service_areas} onChange={set('service_areas')} /></div>
        <div><label className={label}>Workflow steps</label><input className={input} placeholder="comma-separated" value={form.steps} onChange={set('steps')} /></div>
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Creating…' : 'Create service'}</button>
      </form>
    </Card>
  )
}
