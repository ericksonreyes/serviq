import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, btn, input, label, td, th } from '../ui'

export default function FeatureFlags() {
  const { token } = useAuth()
  const [flags, setFlags] = useState(null)
  const [form, setForm] = useState({ key: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    api
      .featureFlags(token)
      .then((res) => setFlags(res.data ?? []))
      .catch((err) => setError(err.message))
  }
  useEffect(load, [token])

  const save = async (data) => {
    setBusy(true)
    setError(null)
    try {
      await api.saveFeatureFlag(token, data)
      setForm({ key: '', description: '' })
      load()
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Feature flags</h1>
      <ErrorBox error={error} />
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-5 shadow"
        onSubmit={(e) => {
          e.preventDefault()
          save({ key: form.key, description: form.description || null, enabled: false })
        }}
      >
        <div className="min-w-48 flex-1">
          <label className={label}>Flag key</label>
          <input className={input} required value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. ai_agent.refund_drafting" />
        </div>
        <div className="min-w-48 flex-1">
          <label className={label}>Description</label>
          <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <button type="submit" className={btn} disabled={busy}>
          Add flag
        </button>
      </form>
      {!flags && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {flags && flags.length === 0 && <Empty>No feature flags defined.</Empty>}
      {flags && flags.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Key</th>
              <th className={th}>Description</th>
              <th className={th}>State</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.id}>
                <td className={`${td} font-mono`}>{f.key}</td>
                <td className={td}>{f.description || '—'}</td>
                <td className={td}>
                  <Badge tone={f.enabled ? 'green' : 'slate'}>{f.enabled ? 'enabled' : 'disabled'}</Badge>
                </td>
                <td className={td}>
                  <button
                    className={f.enabled ? 'text-red-700 hover:underline' : 'text-teal-700 hover:underline'}
                    disabled={busy}
                    onClick={() => save({ key: f.key, enabled: !f.enabled, description: f.description })}
                  >
                    {f.enabled ? 'Disable' : 'Enable'}
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
