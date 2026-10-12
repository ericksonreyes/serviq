import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, PageHead, btn, btnSecondary, input, label, money, td, th } from '../ui'

const BLANK = { code: '', name: '', description: '', price_cents: '', currency: 'PHP', features: '', active: true }

// features is a JSONB map (e.g. {max_agents: 15, max_services: 25}),
// not a string list — display/edit it as "key: value" pairs.
const fmtFeatures = (f) => {
  if (Array.isArray(f)) return f.join(', ') || '—'
  if (f && typeof f === 'object')
    return Object.entries(f).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v === true ? 'yes' : v}`).join(' · ') || '—'
  return '—'
}
// Known feature keys — the seeded catalog. Extend here as plans learn new
// limits/flags; keys outside the catalog are preserved on save but not shown.
const FEATURE_CATALOG = [
  { key: 'max_agents', label: 'Max agents', type: 'number', hint: 'Field agent cap for the provider' },
  { key: 'max_services', label: 'Max services', type: 'number', hint: 'Service catalog size cap' },
]

function PlanForm({ initial, onSaved, onCancel }) {
  const { token } = useAuth()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(() => {
    const init = initial?.features
    const features = init && typeof init === 'object' && !Array.isArray(init) ? { ...init } : {}
    return { ...BLANK, ...initial, features }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const setFeature = (key, v) =>
    setForm((f) => {
      const features = { ...f.features }
      if (v === undefined) delete features[key]
      else features[key] = v
      return { ...f, features }
    })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = {
      name: form.name,
      description: form.description || null,
      price_cents: Math.round(Number(form.price_cents) || 0),
      currency: form.currency || 'PHP',
      features: Object.keys(form.features).length ? form.features : null,
      active: form.active,
      ...(editing ? {} : { code: form.code }),
    }
    try {
      const res = editing
        ? await api.updatePlan(token, initial.id, body)
        : await api.createPlan(token, body)
      onSaved(res.data)
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow">
      <h2 className="text-base font-semibold text-slate-900">{editing ? `Edit ${initial.code}` : 'New plan'}</h2>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!editing && (
          <div>
            <label className={label}>Code</label>
            <input className={input} required pattern="[a-z0-9\-]+" value={form.code} onChange={set('code')} />
          </div>
        )}
        <div>
          <label className={label}>Name</label>
          <input className={input} required value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className={label}>Price (cents)</label>
          <input className={input} type="number" min="0" value={form.price_cents} onChange={set('price_cents')} />
        </div>
        <div>
          <label className={label}>Currency</label>
          <input className={input} maxLength="3" value={form.currency} onChange={set('currency')} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Description</label>
          <input className={input} value={form.description ?? ''} onChange={set('description')} />
        </div>
        <div className="sm:col-span-2">
          <span className={label}>Features</span>
          <div className="mt-1 space-y-3 rounded-lg border border-slate-200 p-3">
            {FEATURE_CATALOG.map((f) =>
              f.type === 'boolean' ? (
                <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.features[f.key] === true}
                    onChange={(e) => setFeature(f.key, e.target.checked ? true : undefined)}
                  />
                  {f.label}
                  <span className="font-mono text-xs text-slate-400">{f.key}</span>
                  <span className="text-xs text-slate-400">— {f.hint}</span>
                </label>
              ) : (
                <div key={f.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-36 text-slate-700">{f.label}</span>
                  <input
                    type="number"
                    min="0"
                    className={`${input} w-28`}
                    placeholder="—"
                    value={form.features[f.key] ?? ''}
                    onChange={(e) => setFeature(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                  <span className="font-mono text-xs text-slate-400">{f.key}</span>
                  <span className="text-xs text-slate-400">— {f.hint}</span>
                </div>
              )
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.active} onChange={set('active')} />
          Active (offered to providers)
        </label>
      </div>
      <div className="flex gap-3">
        <button type="submit" className={btn} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save plan' : 'Create plan'}
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Plans() {
  const { token } = useAuth()
  const [plans, setPlans] = useState(null)
  const [editing, setEditing] = useState(null) // plan object or {} for create
  const [error, setError] = useState(null)

  const load = () => {
    api
      .plans(token)
      .then((res) => setPlans(res.data ?? []))
      .catch((err) => setError(err.message))
  }
  useEffect(load, [token])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <PageHead title="Plans & subscriptions" desc="Subscription tiers, limits, and pricing." />
          <p className="mt-1 text-sm text-slate-500">
            Plan catalog shown below — assign a plan to a provider from the provider's detail page.
          </p>
        </div>
        <button className={btn} onClick={() => setEditing({})}>
          New plan
        </button>
      </div>
      <ErrorBox error={error} />
      {editing && (
        <PlanForm
          initial={editing.id ? editing : null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {!editing && (
      <>
      {!plans && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {plans && plans.length === 0 && <Empty>No plans defined yet.</Empty>}
      {plans && plans.length > 0 && (
        <div className="hidden sm:block overflow-x-auto"><table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Code</th>
              <th className={th}>Name</th>
              <th className={th}>Price</th>
              <th className={th}>Features</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-mono`}>{p.code}</td>
                <td className={td}>{p.name}</td>
                <td className={td}>{money(p.price_cents, p.currency)}</td>
                <td className={td}>{fmtFeatures(p.features)}</td>
                <td className={td}>
                  <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'active' : 'inactive'}</Badge>
                </td>
                <td className={td}>
                  <button className="text-violet-700 hover:underline" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {plans && plans.length > 0 && (
        <div className="sm:hidden divide-y divide-slate-100 rounded-lg bg-white text-sm shadow">
          {plans.map((p) => (
            <div key={p.id} className="space-y-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">{p.code}</span>
                </div>
                <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'active' : 'inactive'}</Badge>
              </div>
              <div className="text-slate-600">{money(p.price_cents, p.currency)}</div>
              <div className="text-slate-600">{fmtFeatures(p.features)}</div>
              <div className="pt-1">
                <button className="text-violet-700 hover:underline" onClick={() => setEditing(p)}>
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
