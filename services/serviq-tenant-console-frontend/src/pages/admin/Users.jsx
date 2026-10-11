import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, StatusBadge, btn, input, label } from '../../components/ui'

// Tenant staff management — create users and grant roles (e.g. Dispatcher
// permissions). Scope is the tenant_id; roles are per-tenant from IAM.
export default function Users() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading, reload } = useLoader(async () => {
    const [users, roles] = await Promise.all([
      api.users(token, tenant),
      api.roles(token, tenant).catch(() => []),
    ])
    return { users: rows(users), roles: rows(roles) }
  }, [token, tenant])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Users & roles</h1>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Staff">
            {loading ? <Loading /> : !data || data.users.length === 0 ? <Empty /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th_>Username</Th_><Th_>Name</Th_><Th_>Roles</Th_><Th_>Status</Th_><Th_ /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.users.map((u) => <UserRow key={u.id} user={u} roles={data.roles} token={token} onDone={reload} />)}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        <NewUser token={token} tenant={tenant} roles={data?.roles ?? []} onDone={reload} />
      </div>
    </div>
  )
}

const Th_ = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>

function UserRow({ user, roles, token, onDone }) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(user.roles?.map((r) => r.name) ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.assignRoles(token, user.id, sel)
      setOpen(false)
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr>
        <td className="px-3 py-2 text-sm font-medium">{user.username}</td>
        <td className="px-3 py-2 text-sm">{user.display_name || '—'}</td>
        <td className="px-3 py-2 text-sm">{(user.roles || []).map((r) => r.name).join(', ') || '—'}</td>
        <td className="px-3 py-2"><StatusBadge value={user.status || 'active'} /></td>
        <td className="px-3 py-2 text-right">
          <button onClick={() => setOpen(!open)} className="text-sm font-medium text-teal-700 hover:underline">
            {open ? 'Close' : 'Assign roles'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-3 py-3">
            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
            <div className="flex flex-wrap items-center gap-3">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={sel.includes(r.name)}
                    onChange={(e) => setSel(e.target.checked ? [...sel, r.name] : sel.filter((n) => n !== r.name))}
                  />
                  {r.name}
                </label>
              ))}
              {roles.length === 0 && <p className="text-sm text-slate-400">No tenant roles yet — create users with a role to seed it.</p>}
              <button onClick={save} disabled={busy || sel.length === 0} className={btn}>{busy ? 'Saving…' : 'Save roles'}</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function NewUser({ token, tenant, roles, onDone }) {
  const [form, setForm] = useState({ username: '', password: '', display_name: '', email: '', roles: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.createUser(token, {
        scope: tenant,
        username: form.username,
        password: form.password,
        display_name: form.display_name || undefined,
        email: form.email || undefined,
        roles: form.roles.length ? form.roles : undefined,
      })
      setOk(`User ${form.username} created — they can sign in with these credentials.`)
      setForm({ username: '', password: '', display_name: '', email: '', roles: [] })
      onDone()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add user">
      <Notice>{ok}</Notice>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div><label className={label}>Username</label><input className={input} required value={form.username} onChange={set('username')} /></div>
        <div><label className={label}>Display name</label><input className={input} value={form.display_name} onChange={set('display_name')} /></div>
        <div><label className={label}>Email</label><input className={input} type="email" value={form.email} onChange={set('email')} /></div>
        <div><label className={label}>Temporary password</label><input className={input} type="password" required minLength={8} value={form.password} onChange={set('password')} /></div>
        <div>
          <label className={label}>Roles</label>
          <div className="mt-1 flex flex-wrap gap-3">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.roles.includes(r.name)}
                  onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, r.name] : form.roles.filter((n) => n !== r.name) })}
                />
                {r.name}
              </label>
            ))}
            {roles.length === 0 && <p className="text-xs text-slate-400">No roles yet — type a name below to create one implicitly via assign.</p>}
          </div>
        </div>
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Creating…' : 'Create user'}</button>
      </form>
    </Card>
  )
}
