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
    </div>
  )
}
