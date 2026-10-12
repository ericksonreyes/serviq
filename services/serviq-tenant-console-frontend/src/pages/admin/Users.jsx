import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, Pager, StatusBadge, btn, btnGhost, input, label, link, linkDanger } from '../../components/ui'

// Tenant staff management — create users and grant roles (e.g. Dispatcher
// permissions). Scope is the tenant_id; roles are per-tenant from IAM.
export default function Users() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const { data, error, loading, reload } = useLoader(async () => {
    const [users, roles] = await Promise.all([
      api.users(token, tenant, page),
      api.roles(token, tenant).catch(() => []),
    ])
    return { users: rows(users), usersMeta: users, roles: rows(roles) }
  }, [token, tenant, page])

  return (
    <div className="space-y-4">
      <PageHead title="Users & roles" desc="Staff accounts and what each role can do in this console." />
      <ErrorBox error={error} />
      {adding ? (
        <NewUser token={token} tenant={tenant} roles={data?.roles ?? []} onDone={() => { setAdding(false); reload() }} onCancel={() => setAdding(false)} />
      ) : (
      <Card title="Staff" actions={<button className={btn} onClick={() => setAdding(true)}>New user</button>}>
            <Pager meta={data?.usersMeta} onPage={setPage} top />
            {loading ? <Loading /> : !data || data.users.length === 0 ? <Empty /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th_>Username</Th_><Th_>Name</Th_><Th_>Roles</Th_><Th_>Status</Th_><Th_ /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.users.map((u) => <UserRow key={u.id} user={u} roles={data.roles} token={token} onDone={reload} />)}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {data.users.map((u) => <UserCard key={u.id} user={u} roles={data.roles} token={token} onDone={reload} />)}
              </div>
              </>
            )}
            <Pager meta={data?.usersMeta} onPage={setPage} />
      </Card>
      )}
    </div>
  )
}

const Th_ = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>

// Shared row state — the desktop <tr> and the mobile card render the same
// expandable panels: role assignment and profile edit, plus status toggle.
function useUserRow(user, token, onDone) {
  const [open, setOpen] = useState(null) // 'roles' | 'edit' | null
  const [sel, setSel] = useState(user.roles?.map((r) => r.name) ?? [])
  const [profile, setProfile] = useState({ display_name: user.display_name ?? '', email: user.email ?? '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const run = async (fn) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      setOpen(null)
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveRoles = () => run(() => api.assignRoles(token, user.id, sel))
  const saveProfile = () => run(() => api.updateUser(token, user.id, {
    display_name: profile.display_name || null,
    email: profile.email || null,
    ...(profile.password ? { password: profile.password } : {}),
  }))
  const toggleStatus = () => run(() => api.updateUser(token, user.id, {
    status: user.status === 'disabled' ? 'active' : 'disabled',
  }))

  return { open, setOpen, sel, setSel, profile, setProfile, busy, err, saveRoles, saveProfile, toggleStatus }
}

function AssignPanel({ roles, s }) {
  return (
    <>
      {s.err && <p className="mb-2 text-sm text-red-600">{s.err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={s.sel.includes(r.name)}
              onChange={(e) => s.setSel(e.target.checked ? [...s.sel, r.name] : s.sel.filter((n) => n !== r.name))}
            />
            {r.name}
          </label>
        ))}
        {roles.length === 0 && <p className="text-sm text-slate-400">No roles yet — they appear once a user is created with one.</p>}
        <button onClick={s.saveRoles} disabled={s.busy || s.sel.length === 0} className={btn}>{s.busy ? 'Saving…' : 'Save roles'}</button>
      </div>
    </>
  )
}

function EditPanel({ s }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); s.saveProfile() }} className="space-y-3">
      {s.err && <p className="mb-2 text-sm text-red-600">{s.err}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={label}>Display name</label><input className={input} value={s.profile.display_name} onChange={(e) => s.setProfile({ ...s.profile, display_name: e.target.value })} /></div>
        <div><label className={label}>Email</label><input className={input} type="email" value={s.profile.email} onChange={(e) => s.setProfile({ ...s.profile, email: e.target.value })} /></div>
        <div><label className={label}>New password (optional)</label><input className={input} type="password" minLength={8} placeholder="Leave blank to keep current" value={s.profile.password} onChange={(e) => s.setProfile({ ...s.profile, password: e.target.value })} /></div>
      </div>
      <button type="submit" disabled={s.busy} className={btn}>{s.busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  )
}

function RowActions({ user, s }) {
  return (
    <div className="flex justify-end gap-3">
      <button onClick={() => s.setOpen(s.open === 'roles' ? null : 'roles')} className={link}>
        {s.open === 'roles' ? 'Close' : 'Roles'}
      </button>
      <button onClick={() => s.setOpen(s.open === 'edit' ? null : 'edit')} className={link}>
        {s.open === 'edit' ? 'Close' : 'Edit'}
      </button>
      <button onClick={s.toggleStatus} disabled={s.busy} className={user.status === 'disabled' ? link : linkDanger}>
        {user.status === 'disabled' ? 'Enable' : 'Disable'}
      </button>
    </div>
  )
}

function UserRow({ user, roles, token, onDone }) {
  const s = useUserRow(user, token, onDone)

  return (
    <>
      <tr>
        <td className="px-3 py-2 text-sm font-medium">{user.username}</td>
        <td className="px-3 py-2 text-sm">{user.display_name || '—'}</td>
        <td className="px-3 py-2 text-sm">{(user.roles || []).map((r) => r.name).join(', ') || '—'}</td>
        <td className="px-3 py-2"><StatusBadge value={user.status || 'active'} /></td>
        <td className="px-3 py-2"><RowActions user={user} s={s} /></td>
      </tr>
      {s.open && (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-3 py-3">
            {s.open === 'roles' ? <AssignPanel roles={roles} s={s} /> : <EditPanel s={s} />}
          </td>
        </tr>
      )}
    </>
  )
}

function UserCard({ user, roles, token, onDone }) {
  const s = useUserRow(user, token, onDone)

  return (
    <div className="space-y-1.5 px-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user.username}</div>
          {user.display_name && <div className="truncate text-xs text-slate-500">{user.display_name}</div>}
        </div>
        <StatusBadge value={user.status || 'active'} />
      </div>
      <div className="text-sm text-slate-600">{(user.roles || []).map((r) => r.name).join(', ') || '—'}</div>
      <div className="pt-1"><RowActions user={user} s={s} /></div>
      {s.open && (
        <div className="rounded-lg bg-slate-50 p-3">
          {s.open === 'roles' ? <AssignPanel roles={roles} s={s} /> : <EditPanel s={s} />}
        </div>
      )}
    </div>
  )
}

function NewUser({ token, tenant, roles, onDone, onCancel }) {
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
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btn}>{busy ? 'Creating…' : 'Create user'}</button>
          <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </Card>
  )
}
