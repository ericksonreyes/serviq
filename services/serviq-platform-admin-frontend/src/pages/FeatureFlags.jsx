import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, td, th } from '../ui'

export default function FeatureFlags() {
  const { token } = useAuth()
  const [flags, setFlags] = useState(null)
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
      <p className="text-sm text-slate-500">
        Kill-switches for platform capabilities. A flag only works where a consumer checks it —
        new gates ship with the codebase, not this page.
      </p>
      <ErrorBox error={error} />
      {!flags && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {flags && flags.length === 0 && <Empty>No feature flags defined.</Empty>}
      {flags && flags.length > 0 && (
        <div className="hidden sm:block overflow-x-auto"><table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
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
                    className={f.enabled ? 'text-red-700 hover:underline' : 'text-violet-700 hover:underline'}
                    disabled={busy}
                    onClick={() => save({ key: f.key, enabled: !f.enabled, description: f.description })}
                  >
                    {f.enabled ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {flags && flags.length > 0 && (
        <div className="sm:hidden divide-y divide-slate-100 rounded-lg bg-white text-sm shadow">
          {flags.map((f) => (
            <div key={f.id} className="space-y-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm">{f.key}</span>
                <Badge tone={f.enabled ? 'green' : 'slate'}>{f.enabled ? 'enabled' : 'disabled'}</Badge>
              </div>
              {f.description && <div className="text-slate-600">{f.description}</div>}
              <div className="pt-1">
                <button
                  className={f.enabled ? 'text-red-700 hover:underline' : 'text-violet-700 hover:underline'}
                  disabled={busy}
                  onClick={() => save({ key: f.key, enabled: !f.enabled, description: f.description })}
                >
                  {f.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
