import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Home() {
  const { token, setToken } = useAuth()
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.me(token).then(setMe).catch((err) => setError(err.message))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <span className="font-semibold">ServIQ Tenant Console</span>
        <button onClick={() => setToken(null)} className="text-sm text-slate-300 hover:text-white">
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-lg font-semibold text-slate-900">Organization</h1>
        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {me && (
          <div className="mt-4 rounded-lg bg-white p-4 shadow">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">User</dt><dd className="font-mono">{me.sub}</dd></div>
              <div><dt className="text-slate-500">Tenant</dt><dd className="font-mono">{me.tenant_id ?? 'platform'}</dd></div>
              <div><dt className="text-slate-500">Roles</dt><dd>{(me.roles || []).join(', ') || '—'}</dd></div>
              <div><dt className="text-slate-500">Permissions</dt><dd>{(me.permissions || []).join(', ') || '—'}</dd></div>
            </dl>
          </div>
        )}
        <p className="mt-4 text-sm text-slate-500">
          Tenant management surfaces land here as their APIs come online.
        </p>
      </main>
    </div>
  )
}
