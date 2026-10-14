import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, ErrorBox, Loading, PageHead, StatusBadge, btn, btnGhost, input, label, link, money, select } from '../../components/ui'

const csv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// Dedicated service page — identity edit, workflow steps, and pricing were
// three forms crammed into a row expansion; per LAYOUT.MD dense action
// surfaces graduate to their own route.
export default function ServiceDetail() {
  const { serviceId } = useParams()
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading, reload } = useLoader(
    async () => rows(await api.services(token, tenant)).find((s) => s.id === serviceId) ?? null,
    [token, tenant, serviceId],
  )

  if (loading) return <div className="space-y-4"><PageHead title="Service" /><Loading /></div>
  if (error) return <div className="space-y-4"><PageHead title="Service" /><ErrorBox error={error} /></div>
  const s = data
  if (!s) return <div className="space-y-4"><PageHead title="Service" /><ErrorBox error="Service not found." /></div>

  return (
    <div className="space-y-4">
      <PageHead
        title={s.name}
        desc={`${money(s.price_cents, s.currency)} · ${(s.workflow_steps || []).length} workflow steps`}
      />
      <Link to="/admin/services" className={link}>← Back to catalog</Link>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Service" actions={<StatusBadge value={s.active === false ? 'inactive' : 'active'} />}>
          <EditService service={s} token={token} tenant={tenant} onDone={reload} />
        </Card>
        <div className="space-y-4">
          <Card title="Workflow steps">
            <StepsEditor service={s} token={token} tenant={tenant} onDone={reload} />
          </Card>
          <Card title="Pricing">
            <PricingEditor service={s} token={token} tenant={tenant} />
          </Card>
        </div>
      </div>
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
      <div className="mt-2 flex items-center gap-3">
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
          <select className={select} value={form.price_type} onChange={(e) => setForm({ ...form, price_type: e.target.value })}>
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
