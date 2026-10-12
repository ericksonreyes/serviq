import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, ErrorBox, PageHead, STATUS_TONE, btn, btnDanger, btnSecondary, card, input, label, select } from '../ui'

const TRANSITIONS = {
  pending: ['activate', 'deactivate'],
  active: ['suspend', 'deactivate'],
  suspended: ['activate', 'deactivate'],
  deactivated: [],
}

export default function TenantDetail() {
  const { id } = useParams()
  const { token } = useAuth()
  const [tenant, setTenant] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [plans, setPlans] = useState([])
  const [subForm, setSubForm] = useState({ plan_id: '', status: 'active' })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = () => {
    api
      .tenant(token, id)
      .then((res) => {
        setTenant(res.data)
        setName(res.data.name)
      })
      .catch((err) => setError(err.message))
    api
      .subscription(token, id)
      .then((res) => {
        setSubscription(res.data)
        if (res.data) {
          setSubForm({ plan_id: res.data.plan_id, status: res.data.status })
        }
      })
      .catch(() => {})
    api.plans(token).then((res) => setPlans(res.data ?? [])).catch(() => {})
  }

  useEffect(load, [token, id])

  const run = (fn, message) => async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(message)
      load()
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message)
    } finally {
      setBusy(false)
    }
  }

  const transition = (action) =>
    run(async () => {
      await api.transitionTenant(token, id, action)
    }, `Provider ${action}d.`)

  const saveName = run(async () => {
    await api.updateTenant(token, id, { name })
  }, 'Provider updated.')

  const saveSubscription = run(async () => {
    await api.saveSubscription(token, id, subForm)
  }, 'Subscription saved.')

  if (!tenant && !error) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link to="/providers" className="text-sm text-violet-700 hover:underline">
          ← Service providers
        </Link>
        <PageHead title={tenant?.name} desc="Provider account — subscription, users, and configuration." />
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>
      )}
      {tenant && (
        <>
          <section className={card}>
            <div className="flex items-start justify-between">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <dt className="text-slate-500">Slug</dt>
                <dd className="font-mono">{tenant.slug}</dd>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge tone={STATUS_TONE[tenant.status]}>{tenant.status}</Badge>
                </dd>
              </dl>
              <div className="flex gap-3">
                {(TRANSITIONS[tenant.status] || []).map((action) => (
                  <button
                    key={action}
                    className={action === 'activate' ? btn : btnDanger}
                    disabled={busy}
                    onClick={() => {
                      if (action === 'activate' || window.confirm(`${action} ${tenant.name}?`)) {
                        transition(action)()
                      }
                    }}
                  >
                    {action[0].toUpperCase() + action.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <form
              className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-4"
              onSubmit={(e) => {
                e.preventDefault()
                saveName()
              }}
            >
              <div className="flex-1">
                <label className={label}>Business name</label>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <button type="submit" className={btnSecondary} disabled={busy || name === tenant.name}>
                Rename
              </button>
            </form>
          </section>

          <section className={card}>
            <h2 className="text-base font-semibold text-slate-900">Subscription</h2>
            <p className="mt-1 text-sm text-slate-500">
              {subscription
                ? `On ${subscription.plan?.name ?? 'a plan'} (${subscription.status})`
                : 'No subscription on record — assign a plan below.'}
            </p>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                saveSubscription()
              }}
            >
              <div>
                <label className={label}>Plan</label>
                <select
                  className={select}
                  required
                  value={subForm.plan_id}
                  onChange={(e) => setSubForm({ ...subForm, plan_id: e.target.value })}
                >
                  <option value="">Select plan…</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Status</label>
                <select
                  className={select}
                  value={subForm.status}
                  onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
                >
                  {['active', 'past_due', 'canceled'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={btn} disabled={busy || !subForm.plan_id}>
                Save subscription
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  )
}
