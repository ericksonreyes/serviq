import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

const input = 'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none'
const label = 'block text-sm font-medium text-slate-700'

export default function Login() {
  const { setToken } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '', tenant_id: location.state?.tenant_id || '' })
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
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">ServIQ Tenant Console</h1>
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
          <div>
            <label className={label}>Tenant ID</label>
            <input className={input} required placeholder="Your organization tenant ID" value={form.tenant_id} onChange={set('tenant_id')} />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-sm text-slate-500">
            New service provider? <Link to="/signup" className="text-slate-900 underline">Create your organization</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
