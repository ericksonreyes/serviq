import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { Card, ErrorBox, Notice, btn, input, label, select } from '../../components/ui'

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const DEFAULT_HOURS = {
  monday: { open: '08:00', close: '17:00' },
  tuesday: { open: '08:00', close: '17:00' },
  wednesday: { open: '08:00', close: '17:00' },
  thursday: { open: '08:00', close: '17:00' },
  friday: { open: '08:00', close: '17:00' },
  saturday: { open: '08:00', close: '17:00' },
  sunday: null,
}

// A removable-date list editor — one-off closures store Y-m-d, recurring
// holidays store MM-DD (the year is stripped on add).
function DateList({ title, hint, values, onChange, recurring }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    if (!draft) return
    const v = recurring ? draft.slice(5) : draft
    if (!values.includes(v)) onChange([...values, v].sort())
    setDraft('')
  }
  return (
    <div>
      <label className={label}>{title}</label>
      {hint && <p className="mb-1 text-xs text-slate-400">{hint}</p>}
      <div className="flex gap-2">
        <input type="date" className={input} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" className={btn} onClick={add}>Add</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-sm font-medium text-brand-800">
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="text-brand-500 hover:text-brand-800"
              onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
          </span>
        ))}
        {values.length === 0 && <span className="text-sm text-slate-400">None set</span>}
      </div>
    </div>
  )
}

// Per-weekday operating hours — the structured shape availability reads.
function HoursEditor({ hours, onChange }) {
  return (
    <div>
      <label className={label}>Operating hours</label>
      <div className="space-y-1.5">
        {WEEKDAYS.map((d) => {
          const w = hours[d]
          return (
            <div key={d} className="flex items-center gap-2 text-sm">
              <label className="flex w-28 items-center gap-1.5 capitalize">
                <input
                  type="checkbox"
                  checked={!!w}
                  onChange={(e) => onChange({ ...hours, [d]: e.target.checked ? { open: '08:00', close: '17:00' } : null })}
                />
                {d}
              </label>
              {w ? (
                w.close === '24:00' ? (
                  <>
                    <span className="text-sm text-slate-600">Open 24 hours</span>
                    <button type="button" className="text-sm text-brand-600 hover:underline"
                      onClick={() => onChange({ ...hours, [d]: { open: '08:00', close: '17:00' } })}>
                      set times
                    </button>
                  </>
                ) : (
                  <>
                    <input type="time" className={input} value={w.open}
                      onChange={(e) => onChange({ ...hours, [d]: { ...w, open: e.target.value } })} />
                    <span className="text-slate-400">–</span>
                    <input type="time" className={input} value={w.close}
                      onChange={(e) => onChange({ ...hours, [d]: { ...w, close: e.target.value } })} />
                    <button type="button" className="text-sm text-brand-600 hover:underline"
                      title="Open around the clock"
                      onClick={() => onChange({ ...hours, [d]: { open: '00:00', close: '24:00' } })}>
                      24h
                    </button>
                  </>
                )
              ) : (
                <span className="text-xs text-slate-400">Closed</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Business settings — tenant-level operating hours/days, closures,
// cancellation policy, and operational flags (GET/PUT /settings).
export default function Settings() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [form, setForm] = useState({
    cancellation_policy: '',
    accepts_cash: true,
    accepts_digital: true,
    auto_broadcast: false,
  })
  const [hours, setHours] = useState(DEFAULT_HOURS)
  const [crews, setCrews] = useState(1)
  const [nonWorkingDays, setNonWorkingDays] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.settings(token, tenant)
      .then((res) => {
        // The endpoint nests settings: {data: {tenant_id, settings: {...}}}
        const s = res.data?.settings ?? res.data ?? res
        if (s && typeof s === 'object') {
          setForm((f) => ({ ...f, ...s }))
          if (s.operating_hours && typeof s.operating_hours === 'object') setHours({ ...DEFAULT_HOURS, ...s.operating_hours })
          if (s.crews != null) setCrews(Number(s.crews) || 1)
          if (Array.isArray(s.non_working_days)) setNonWorkingDays(s.non_working_days)
          if (Array.isArray(s.holidays)) setHolidays(s.holidays)
        }
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
      await api.saveSettings(token, tenant, {
        ...form,
        operating_hours: hours,
        crews,
        non_working_days: nonWorkingDays,
        holidays,
      })
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
              <HoursEditor hours={hours} onChange={setHours} />
              <div>
                <label className={label}>Crews</label>
                <input type="number" min={1} max={50} className={input} value={crews}
                  onChange={(e) => setCrews(Number(e.target.value) || 1)} />
                <p className="mt-1 text-xs text-slate-400">
                  Parallel job capacity — used only when no agent schedules are projected yet.
                </p>
              </div>
              <DateList
                title="Non-working days"
                hint="One-off closures — staff leave, company events. Stored as full dates."
                values={nonWorkingDays} onChange={setNonWorkingDays}
              />
              <DateList
                title="Holidays"
                hint="Recurring every year — stored as MM-DD."
                values={holidays} onChange={setHolidays} recurring
              />
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
              <select id="dispatch-strategy" className={select} value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
                {STRATEGIES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            {form.strategy === 'broadcast' && (
              <div>
                <label className={label} htmlFor="dispatch-ttl">Offer expires after (seconds)</label>
                <input id="dispatch-ttl" type="number" min={5} max={86400} value={form.offer_ttl_seconds} onChange={(e) => setForm({ ...form, offer_ttl_seconds: e.target.value })} />
              </div>
            )}
            <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save strategy'}</button>
          </form>
        </>
      )}
    </Card>
  )
}
