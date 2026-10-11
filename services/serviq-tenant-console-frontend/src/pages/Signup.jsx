import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600'
const label = 'block text-sm font-medium text-slate-700'

export default function Signup({ tenantSlug }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '', slug: '',
    admin_display_name: '', admin_username: '', admin_email: '',
    admin_password: '', admin_password_confirmation: '',
  })
  const [tenantId, setTenantId] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.signup(form)
      setTenantId(res.data.id)
    } catch (err) {
      const first = err.fields ? Object.values(err.fields).flat()[0] : null
      setError(first || err.message)
    } finally {
      setBusy(false)
    }
  }

  if (tenantId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-slate-900">Organization created</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your service provider account is pending platform review. You can sign
            in with your admin credentials using your organization handle:
          </p>
          <p className="mt-2 rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">{form.slug || tenantId}</p>
          <Link
            to="/login"
            state={{ tenant_id: form.slug || tenantId }}
            className="mt-4 block w-full rounded bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-700"
          >
            Continue to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">Become a service provider</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create your organization on ServIQ. The platform reviews new providers before activation.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Organization name</label>
              <input className={input} required value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label className={label}>Slug</label>
              <input className={input} required pattern="[a-z0-9-]+" placeholder="acme-services" value={form.slug} onChange={set('slug')} />
            </div>
          </div>
          <div>
            <label className={label}>Your name</label>
            <input className={input} required value={form.admin_display_name} onChange={set('admin_display_name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Username</label>
              <input className={input} required value={form.admin_username} onChange={set('admin_username')} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input className={input} type="email" required value={form.admin_email} onChange={set('admin_email')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Password</label>
              <input className={input} type="password" required value={form.admin_password} onChange={set('admin_password')} />
            </div>
            <div>
              <label className={label}>Confirm password</label>
              <input className={input} type="password" required value={form.admin_password_confirmation} onChange={set('admin_password_confirmation')} />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-teal-700 px-3 py-2.5 text-base font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create organization'}
          </button>
          <p className="text-sm text-slate-500">
            Already a provider? <Link to={tenantSlug ? `/provider/${tenantSlug}/login` : '/login'} className="text-slate-900 underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
