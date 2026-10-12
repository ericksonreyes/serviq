import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useDebounced } from '../hooks'
import { Badge, Empty, ErrorBox, PageHead, Pager, STATUS_TONE, btn, btnSecondary, input, label, select, td, th } from '../ui'

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
          <select className={select} value={form.plan_id} onChange={set('plan_id')}>
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
      <div className="flex gap-3">
        <button type="submit" className={btn} disabled={busy}>
          {busy ? 'Creating…' : 'Create provider'}
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
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState(null)
  const [page, setPage] = useState(1)

  const load = (term, p) => {
    setLoading(true)
    api
      .tenants(token, status, term, p)
      .then((res) => { setTenants(res.data ?? []); setMeta(res.data ? res : null) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => load(dq, page), [token, status, dq, page])

  const search = (e) => {
    e.preventDefault()
    setPage(1)
    load(q, 1)
  }
  useEffect(() => {
    api.plans(token).then((res) => setPlans(res.data ?? [])).catch(() => {})
  }, [token])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <PageHead title="Service providers" desc="Organizations on the platform — plan, status, and drill-in." />
        <button type="button" className={`${btn} whitespace-nowrap`} onClick={() => setCreating((v) => !v)}>
          {creating ? 'Close' : 'New provider'}
        </button>
      </div>
      {creating && (
        <CreateTenant
          plans={plans}
          onCancel={() => setCreating(false)}
          onCreated={(t) => navigate(`/providers/${t.id}`)}
        />
      )}
      {!creating && (
      <>
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className={`${input} sm:max-w-xs`}
          placeholder="Search name or slug…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }}
        />
        <button type="submit" className={btnSecondary} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
        <select className={select} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </form>
      <ErrorBox error={error} />
      {loading && <p className="text-sm text-slate-500">Searching…</p>}
      <Pager meta={meta} onPage={setPage} top />
      {!tenants && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {tenants && tenants.length === 0 && <Empty>No service providers match.</Empty>}
      {tenants && tenants.length > 0 && (
        <div className="hidden sm:block overflow-x-auto"><table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Slug</th>
              <th className={th}>Status</th>
              <th className={th}>Plan</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className={td}>
                  <Link to={`/providers/${t.id}`} className="font-medium text-violet-700 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className={td}>{t.slug}</td>
                <td className={td}>
                  <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                </td>
                <td className={td}>{t.plan?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {tenants && tenants.length > 0 && (
        <div className="sm:hidden divide-y divide-slate-100 rounded-lg bg-white text-sm shadow">
          {tenants.map((t) => (
            <div key={t.id} className="space-y-1 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/providers/${t.id}`} className="font-medium text-violet-700 hover:underline">
                  {t.name}
                </Link>
                <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
              </div>
              <div className="text-xs text-slate-500">{t.slug}</div>
              <div className="text-slate-600">Plan: {t.plan?.name ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
      <Pager meta={meta} onPage={setPage} />
      </>
      )}
    </div>
  )
}
