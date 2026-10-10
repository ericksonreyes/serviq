import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600'
const label = 'block text-sm font-medium text-slate-700'

export default function Login({ tenantSlug }) {
  const { setToken } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '', tenant: location.state?.tenant_id || tenantSlug || '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(form)
      setToken(res.access_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">ServIQ Tenant Console</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to manage your service provider organization.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className={label}>Username</label>
            <input className={input} required value={form.username} onChange={set('username')} />
          </div>
          <div>
            <label className={label}>Password</label>
            <input className={input} type="password" required value={form.password} onChange={set('password')} />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-teal-700 px-3 py-2.5 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-sm text-slate-500">
            New service provider? <Link to={tenantSlug ? `/provider/${tenantSlug}/signup` : '/signup'} className="text-slate-900 underline">Create your organization</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
