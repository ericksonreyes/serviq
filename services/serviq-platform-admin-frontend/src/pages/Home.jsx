import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Home() {
  const { token, setToken } = useAuth()
  const [tenants, setTenants] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.tenants(token)
      .then((res) => setTenants(res.data ?? []))
      .catch((err) => setError(err.message))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <span className="font-semibold">ServIQ Platform Admin</span>
        <button onClick={() => setToken(null)} className="text-sm text-slate-300 hover:text-white">
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-lg font-semibold text-slate-900">Tenants</h1>
        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {tenants && tenants.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No tenants provisioned yet.</p>
        )}
        {tenants && tenants.length > 0 && (
          <table className="mt-4 w-full overflow-hidden rounded-lg bg-white text-sm shadow">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Slug</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Tenant ID</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2">{t.slug}</td>
                  <td className="px-4 py-2">{t.status}</td>
                  <td className="px-4 py-2 font-mono text-xs">{t.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  )
}
