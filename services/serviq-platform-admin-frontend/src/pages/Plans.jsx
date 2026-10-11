import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, btn, btnSecondary, input, label, money, td, th } from '../ui'

const BLANK = { code: '', name: '', description: '', price_cents: '', currency: 'PHP', features: '', active: true }

function PlanForm({ initial, onSaved, onCancel }) {
  const { token } = useAuth()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState({
    ...BLANK,
    ...initial,
    features: Array.isArray(initial?.features) ? initial.features.join(', ') : '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = {
      name: form.name,
      description: form.description || null,
      price_cents: Math.round(Number(form.price_cents) || 0),
      currency: form.currency || 'PHP',
      features: form.features
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
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
          <label className={label}>Features (comma-separated)</label>
          <input className={input} value={form.features} onChange={set('features')} placeholder="e.g. dispatch, ai-agent, analytics" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.active} onChange={set('active')} />
          Active (offered to tenants)
        </label>
      </div>
      <div className="flex gap-2">
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
          <h1 className="text-xl font-semibold text-slate-900">Plans & subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Plan catalog shown below — assign a plan to a tenant from that tenant's detail page.
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
      {!plans && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {plans && plans.length === 0 && <Empty>No plans defined yet.</Empty>}
      {plans && plans.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
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
                <td className={td}>{(p.features || []).join(', ') || '—'}</td>
                <td className={td}>
                  <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'active' : 'inactive'}</Badge>
                </td>
                <td className={td}>
                  <button className="text-teal-700 hover:underline" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
