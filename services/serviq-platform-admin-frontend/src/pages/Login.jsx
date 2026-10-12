import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600'
const label = 'block text-sm font-medium text-slate-700'

const Eye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOff = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M2 12s3.5-7 10-7c2 0 3.7.7 5.2 1.7M22 12s-3.5 7-10 7c-2 0-3.7-.7-5.2-1.7M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
  </svg>
)

export default function Login() {
  const { setToken } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(form)
      setToken(res.access_token, remember, res.refresh_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-violet-50">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">ServIQ Platform Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform operations console — platform-scope sign in.
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
            <div className="relative">
              <input className={`${input} pr-12`} type={showPw ? 'text' : 'password'} required value={form.password} onChange={set('password')} />
              <button
                type="button"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw((s) => !s)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
              >
                {showPw ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-600" />
            Keep me signed in
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-violet-700 px-3 py-2.5 text-base font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
