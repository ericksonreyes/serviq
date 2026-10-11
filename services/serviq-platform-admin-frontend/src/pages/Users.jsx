import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, btn, btnSecondary, input, label, td, th } from '../ui'

function RolePicker({ roles, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((r) => (
        <label
          key={r.id}
          className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
            selected.includes(r.name)
              ? 'border-teal-600 bg-teal-50 text-teal-800'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <input
            type="checkbox"
            className="hidden"
            checked={selected.includes(r.name)}
            onChange={() => onToggle(r.name)}
          />
          {r.name}
        </label>
      ))}
      {roles.length === 0 && <span className="text-xs text-slate-400">No roles in this scope yet.</span>}
    </div>
  )
}

function CreateUser({ scope, roles, onDone }) {
  const { token } = useAuth()
  const [form, setForm] = useState({ username: '', password: '', email: '', display_name: '', roles: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const toggleRole = (name) =>
    setForm({ ...form, roles: form.roles.includes(name) ? form.roles.filter((r) => r !== name) : [...form.roles, name] })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createIamUser(token, {
        scope,
        username: form.username,
        password: form.password,
        email: form.email || null,
        display_name: form.display_name || null,
        roles: form.roles,
      })
      onDone()
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-5 shadow">
      <h3 className="text-sm font-semibold text-slate-900">New user</h3>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Username</label>
          <input className={input} required value={form.username} onChange={set('username')} />
        </div>
        <div>
          <label className={label}>Password (min 8)</label>
          <input className={input} type="password" required minLength="8" value={form.password} onChange={set('password')} />
        </div>
        <div>
          <label className={label}>Display name</label>
          <input className={input} value={form.display_name} onChange={set('display_name')} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input className={input} type="email" value={form.email} onChange={set('email')} />
        </div>
      </div>
      <div>
        <label className={label}>Roles</label>
        <RolePicker roles={roles} selected={form.roles} onToggle={toggleRole} />
      </div>
      <button type="submit" className={btn} disabled={busy}>
        {busy ? 'Creating…' : 'Create user'}
      </button>
    </form>
  )
}

function UserRow({ user, roles, onChanged, onError }) {
  const { token } = useAuth()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(user.roles.map((r) => r.name))
  const [busy, setBusy] = useState(false)
  const toggle = (name) =>
    setSelected(selected.includes(name) ? selected.filter((r) => r !== name) : [...selected, name])

  const saveRoles = async () => {
    if (selected.length === 0) {
      onError('A user needs at least one role.')
      return
    }
    setBusy(true)
    try {
      await api.assignIamRoles(token, user.id, selected)
      setEditing(false)
      onChanged()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async () => {
    setBusy(true)
    try {
      await api.updateIamUser(token, user.id, {
        status: user.status === 'disabled' ? 'active' : 'disabled',
      })
      onChanged()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td className={td}>
        <div className="font-medium">{user.username}</div>
        <div className="text-xs text-slate-500">{user.display_name || ''}</div>
      </td>
      <td className={td}>{user.email || '—'}</td>
      <td className={td}>
        {editing ? (
          <div className="space-y-2">
            <RolePicker roles={roles} selected={selected} onToggle={toggle} />
            <div className="flex gap-2">
              <button className={btn} disabled={busy} onClick={saveRoles}>
                Save
              </button>
              <button className={btnSecondary} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <Badge key={r.id} tone="teal">
                {r.name}
              </Badge>
            ))}
          </div>
        )}
      </td>
      <td className={td}>
        <Badge tone={user.status === 'disabled' ? 'red' : 'green'}>{user.status || 'active'}</Badge>
      </td>
      <td className={td}>
        <div className="flex gap-3">
          <button className="text-teal-700 hover:underline" onClick={() => setEditing((v) => !v)}>
            Roles
          </button>
          <button className="text-red-700 hover:underline" disabled={busy} onClick={toggleStatus}>
            {user.status === 'disabled' ? 'Enable' : 'Disable'}
          </button>
        </div>
      </td>
    </tr>
  )
}

function RolePanel({ scope, permissions, onError }) {
  const { token } = useAuth()
  const [roles, setRoles] = useState(null)
  const [creating, setCreating] = useState(false)
  const [granting, setGranting] = useState(null) // role object
  const [form, setForm] = useState({ name: '', description: '', permissions: [] })
  const [grantSel, setGrantSel] = useState([])
  const [busy, setBusy] = useState(false)

  const load = () => {
    api
      .iamRoles(token, scope)
      .then((res) => setRoles(res.data ?? []))
      .catch((err) => onError(err.message))
  }
  useEffect(load, [token, scope])

  const toggleFormPerm = (name) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(name)
        ? f.permissions.filter((p) => p !== name)
        : [...f.permissions, name],
    }))

  const createRole = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createIamRole(token, {
        scope,
        name: form.name,
        description: form.description || null,
        permissions: form.permissions,
      })
      setCreating(false)
      setForm({ name: '', description: '', permissions: [] })
      load()
    } catch (err) {
      onError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message)
    } finally {
      setBusy(false)
    }
  }

  const grant = async (role) => {
    if (grantSel.length === 0) return
    setBusy(true)
    try {
      await api.grantRolePermissions(token, role.id, grantSel)
      setGranting(null)
      setGrantSel([])
      load()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl bg-white p-5 shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Roles in this scope</h3>
        <button className={btnSecondary} onClick={() => setCreating((v) => !v)}>
          {creating ? 'Close' : 'New role'}
        </button>
      </div>
      {creating && (
        <form onSubmit={createRole} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Role name</label>
              <input className={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={label}>Description</label>
              <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Permissions</label>
            <div className="mt-1 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {permissions.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(p.name)}
                    onChange={() => toggleFormPerm(p.name)}
                  />
                  <span className="font-mono">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className={btn} disabled={busy}>
            Create role
          </button>
        </form>
      )}
      {!roles && <p className="text-sm text-slate-500">Loading…</p>}
      {roles && roles.length === 0 && <Empty>No roles in this scope.</Empty>}
      {roles &&
        roles.map((role) => (
          <div key={role.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-900">{role.name}</span>
                <span className="ml-2 text-xs text-slate-500">{role.description || ''}</span>
              </div>
              <button
                className="text-sm text-teal-700 hover:underline"
                onClick={() => {
                  setGranting(granting?.id === role.id ? null : role)
                  setGrantSel([])
                }}
              >
                Permissions ({role.permissions?.length ?? 0})
              </button>
            </div>
            {role.permissions?.length > 0 && granting?.id !== role.id && (
              <div className="mt-2 flex flex-wrap gap-1">
                {role.permissions.map((p) => (
                  <Badge key={p.id}>{p.name}</Badge>
                ))}
              </div>
            )}
            {granting?.id === role.id && (
              <div className="mt-3 space-y-2">
                <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {permissions
                    .filter((p) => !role.permissions?.some((rp) => rp.name === p.name))
                    .map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={grantSel.includes(p.name)}
                          onChange={() =>
                            setGrantSel(
                              grantSel.includes(p.name)
                                ? grantSel.filter((x) => x !== p.name)
                                : [...grantSel, p.name]
                            )
                          }
                        />
                        <span className="font-mono">{p.name}</span>
                      </label>
                    ))}
                </div>
                <button className={btn} disabled={busy || grantSel.length === 0} onClick={() => grant(role)}>
                  Grant selected
                </button>
              </div>
            )}
          </div>
        ))}
    </section>
  )
}

export default function Users() {
  const { token } = useAuth()
  const [scope, setScope] = useState('platform')
  const [tenants, setTenants] = useState([])
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    setError(null)
    api
      .iamUsers(token, scope)
      .then((res) => setUsers(res.data ?? []))
      .catch((err) => {
        setUsers([])
        setError(err.message)
      })
    api
      .iamRoles(token, scope)
      .then((res) => setRoles(res.data ?? []))
      .catch(() => setRoles([]))
  }

  useEffect(load, [token, scope])
  useEffect(() => {
    api.tenants(token).then((res) => setTenants(res.data ?? [])).catch(() => {})
    api.iamPermissions(token).then((res) => setPermissions(res.data ?? [])).catch(() => {})
  }, [token])

  const scopeName = useMemo(
    () => (scope === 'platform' ? 'Platform' : tenants.find((t) => t.id === scope)?.name ?? scope),
    [scope, tenants]
  )

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Users & roles</h1>
        <div className="flex items-center gap-3">
          <label className={label}>Scope</label>
          <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="platform">Platform</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
          <button className={btn} onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : 'New user'}
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      {creating && (
        <CreateUser scope={scope} roles={roles} onDone={() => { setCreating(false); load() }} />
      )}
      <section className="overflow-hidden rounded-lg bg-white shadow">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Users — {scopeName}
        </div>
        {!users && !error && <p className="p-4 text-sm text-slate-500">Loading…</p>}
        {users && users.length === 0 && <div className="p-4"><Empty>No users in this scope.</Empty></div>}
        {users && users.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>User</th>
                <th className={th}>Email</th>
                <th className={th}>Roles</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} roles={roles} onChanged={load} onError={setError} />
              ))}
            </tbody>
          </table>
        )}
      </section>
      <RolePanel scope={scope} permissions={permissions} onError={setError} />
    </div>
  )
}
