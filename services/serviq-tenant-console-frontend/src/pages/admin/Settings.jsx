import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { Card, ErrorBox, Notice, btn, input, label } from '../../components/ui'

// Business settings — tenant-level operating hours, cancellation policy,
// and operational flags stored as a settings document (GET/PUT /settings).
export default function Settings() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [form, setForm] = useState({
    operating_hours: 'Mon–Sat 08:00–18:00',
    cancellation_policy: '',
    accepts_cash: true,
    accepts_digital: true,
    auto_broadcast: false,
  })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.settings(token, tenant)
      .then((res) => {
        const s = res.data ?? res
        if (s && typeof s === 'object') setForm((f) => ({ ...f, ...s }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, tenant])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.saveSettings(token, tenant, form)
      setOk('Settings saved.')
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  const flag = (k, text) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
      {text}
    </label>
  )

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Business settings</h1>
      <ErrorBox error={err} />
      <Card title="Operations">
        {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            <Notice>{ok}</Notice>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className={label}>Operating hours</label>
                <input className={input} value={form.operating_hours || ''} onChange={(e) => setForm({ ...form, operating_hours: e.target.value })} />
              </div>
              <div>
                <label className={label}>Cancellation policy</label>
                <textarea className={input} rows={3} value={form.cancellation_policy || ''} onChange={(e) => setForm({ ...form, cancellation_policy: e.target.value })} />
              </div>
              <div className="space-y-2">
                <p className={label}>Operational flags</p>
                {flag('accepts_cash', 'Accept cash payments')}
                {flag('accepts_digital', 'Accept digital payments')}
                {flag('auto_broadcast', 'Auto-broadcast new jobs to eligible agents')}
              </div>
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save settings'}</button>
            </form>
          </>
        )}
      </Card>
      <DispatchRules token={token} tenant={tenant} />
    </div>
  )
}

const STRATEGIES = [
  ['automatic', 'Automatic — dispatch picks the best eligible agent'],
  ['broadcast', 'Broadcast — offer to eligible agents, first to accept wins'],
  ['self', 'Self-assign — agents pull from the open job list'],
  ['dispatcher', 'Dispatcher — a dispatcher assigns every job'],
]

// Assignment strategy — dispatch rules owned by Assignment & Dispatch
// (GET/PUT /dispatch/rules); applied when a job becomes ready for assignment.
function DispatchRules({ token, tenant }) {
  const [form, setForm] = useState({ strategy: 'automatic', offer_ttl_seconds: 60 })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.dispatchRules(token, tenant)
      .then((res) => {
        const r = res.data ?? res
        if (r?.strategy) setForm({ strategy: r.strategy, offer_ttl_seconds: r.offer_ttl_seconds ?? 60 })
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [token, tenant])

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.setDispatchRules(token, tenant, {
        strategy: form.strategy,
        offer_ttl_seconds: Number(form.offer_ttl_seconds) || 60,
      })
      setOk('Assignment strategy saved.')
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Assignment strategy">
      <ErrorBox error={err} />
      {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
        <>
          <Notice>{ok}</Notice>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className={label} htmlFor="dispatch-strategy">Strategy</label>
              <select id="dispatch-strategy" className={input} value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
                {STRATEGIES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            {form.strategy === 'broadcast' && (
              <div>
                <label className={label} htmlFor="dispatch-ttl">Offer expires after (seconds)</label>
                <input id="dispatch-ttl" className={input} type="number" min={5} max={86400} value={form.offer_ttl_seconds} onChange={(e) => setForm({ ...form, offer_ttl_seconds: e.target.value })} />
              </div>
            )}
            <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save strategy'}</button>
          </form>
        </>
      )}
    </Card>
  )
}
