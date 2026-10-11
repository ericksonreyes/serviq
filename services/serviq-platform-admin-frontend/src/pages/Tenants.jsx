import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, STATUS_TONE, btn, btnSecondary, input, label, td, th } from '../ui'

const STATUSES = ['', 'pending', 'active', 'suspended', 'deactivated']

function CreateTenant({ plans, onCreated, onCancel }) {
  const { token } = useAuth()
  const [form, setForm] = useState({ name: '', slug: '', plan_id: '', activate: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.createTenant(token, {
        name: form.name,
        slug: form.slug,
        plan_id: form.plan_id || null,
        activate: form.activate,
      })
      onCreated(res.data)
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow">
      <h2 className="text-base font-semibold text-slate-900">New service provider</h2>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Business name</label>
          <input className={input} required value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className={label}>Slug</label>
          <input
            className={input}
            required
            pattern="[a-z0-9\-]+"
            title="Lowercase letters, numbers, dashes"
            value={form.slug}
            onChange={set('slug')}
          />
        </div>
        <div>
          <label className={label}>Plan (optional)</label>
          <select className={input} value={form.plan_id} onChange={set('plan_id')}>
            <option value="">No plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.activate} onChange={set('activate')} />
          Activate immediately (skip review)
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={btn} disabled={busy}>
          {busy ? 'Creating…' : 'Create tenant'}
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Tenants() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [tenants, setTenants] = useState(null)
  const [plans, setPlans] = useState([])
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    api
      .tenants(token, status)
      .then((res) => setTenants(res.data ?? []))
      .catch((err) => setError(err.message))
  }

  useEffect(load, [token, status])
  useEffect(() => {
    api.plans(token).then((res) => setPlans(res.data ?? [])).catch(() => {})
  }, [token])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Service providers</h1>
        <div className="flex items-center gap-3">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s}
              </option>
            ))}
          </select>
          <button className={btn} onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : 'New tenant'}
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      {creating && (
        <CreateTenant
          plans={plans}
          onCancel={() => setCreating(false)}
          onCreated={(t) => navigate(`/tenants/${t.id}`)}
        />
      )}
      {!tenants && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {tenants && tenants.length === 0 && <Empty>No tenants match.</Empty>}
      {tenants && tenants.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Slug</th>
              <th className={th}>Status</th>
              <th className={th}>Plan</th>
              <th className={th}>Tenant ID</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className={td}>
                  <Link to={`/tenants/${t.id}`} className="font-medium text-teal-700 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className={td}>{t.slug}</td>
                <td className={td}>
                  <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                </td>
                <td className={td}>{t.plan?.name ?? '—'}</td>
                <td className={`${td} font-mono text-xs`}>{t.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
