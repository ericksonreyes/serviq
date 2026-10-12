import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, Pager, btn, btnGhost, input, label, link } from '../../components/ui'
import InviteForm from '../../components/InviteForm'

// Customer records — dispatcher/admin creates the account on invitation;
// the customer logs in on the Customer Portal.
export default function Customers() {
  const { token, claims } = useAuth()
  const tenant = useTenant()
  // Writes are permission-gated: requests.manage creates customer records,
  // iam.invitations.manage (or full iam.users.manage) sends invites.
  const perms = claims?.permissions ?? []
  const canCreate = perms.includes('requests.manage')
  const canInvite = perms.includes('iam.invitations.manage') || perms.includes('iam.users.manage')
  const [page, setPage] = useState(1)
  // List-first: forms swap in over the table via their CTA and revert on
  // done/cancel (LAYOUT.MD).
  const [view, setView] = useState(null) // 'create' | 'invite' | null
  const close = () => setView(null)
  const { data, error, loading, reload } = useLoader(
    async () => api.customers(token, tenant, page), [token, tenant, page],
  )
  const customers = rows(data)

  return (
    <div className="space-y-4">
      <PageHead title="Customers" desc="People who request service — records, contacts, and invitations." />
      <ErrorBox error={error} />
      {view === 'create' && <NewCustomer token={token} tenant={tenant} onDone={() => { close(); reload() }} onCancel={close} />}
      {view === 'invite' && <InviteForm token={token} tenant={tenant} role="Customer" onCancel={close} />}
      {view === null && (
      <Card
        title="Customer list"
        actions={(canCreate || canInvite) && (
          <div className="flex gap-3">
            {canCreate && <button className={btn} onClick={() => setView('create')}>Add customer</button>}
            {canInvite && <button className={btnGhost} onClick={() => setView('invite')}>Invite by email</button>}
          </div>
        )}
      >
            <Pager meta={data?.data?.current_page != null ? data.data : data} onPage={setPage} top />
            {loading ? <Loading /> : customers.length === 0 ? <Empty /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th>Name</Th><Th>Contact</Th><Th>Address</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <CustomerRow key={c.id} c={c} token={token} tenant={tenant} onDone={reload} canEdit={canCreate} />
                  ))}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {customers.map((c) => (
                  <CustomerCard key={c.id} c={c} token={token} tenant={tenant} onDone={reload} canEdit={canCreate} />
                ))}
              </div>
              </>
            )}
            <Pager meta={data?.data?.current_page != null ? data.data : data} onPage={setPage} />
      </Card>
      )}
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>

function CustomerRow({ c, token, tenant, onDone, canEdit }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <tr>
        <td className="px-3 py-2 text-sm font-medium">{c.name}</td>
        <td className="px-3 py-2 text-sm">
          {[c.contact?.phone, c.contact?.email].filter(Boolean).join(' · ') || '—'}
        </td>
        <td className="px-3 py-2 text-sm">
          {[c.address?.line1, c.address?.city].filter(Boolean).join(', ') || '—'}
        </td>
        <td className="px-3 py-2 text-right">
          {canEdit && (
            <button onClick={() => setEditing(!editing)} className={link}>
              {editing ? 'Close' : 'Edit'}
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={4} className="bg-slate-50 px-3 py-3">
            <EditCustomer customer={c} token={token} tenant={tenant} onDone={() => { setEditing(false); onDone() }} />
          </td>
        </tr>
      )}
    </>
  )
}

function CustomerCard({ c, token, tenant, onDone, canEdit }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="space-y-1 px-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{c.name}</div>
        {canEdit && (
          <button onClick={() => setEditing(!editing)} className={link}>
            {editing ? 'Close' : 'Edit'}
          </button>
        )}
      </div>
      <div className="text-sm text-slate-600">{[c.contact?.phone, c.contact?.email].filter(Boolean).join(' · ') || '—'}</div>
      <div className="text-xs text-slate-500">{[c.address?.line1, c.address?.city].filter(Boolean).join(', ') || '—'}</div>
      {editing && (
        <div className="rounded-lg bg-slate-50 p-3">
          <EditCustomer customer={c} token={token} tenant={tenant} onDone={() => { setEditing(false); onDone() }} />
        </div>
      )}
    </div>
  )
}

function EditCustomer({ customer, token, tenant, onDone }) {
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.contact?.phone ?? '',
    email: customer.contact?.email ?? '',
    line1: customer.address?.line1 ?? '',
    city: customer.address?.city ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api.updateCustomer(token, tenant, customer.id, {
        name: form.name,
        contact: { phone: form.phone || undefined, email: form.email || undefined },
        address: { line1: form.line1 || undefined, city: form.city || undefined },
      })
      onDone()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={set('name')} /></div>
        <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={set('phone')} /></div>
        <div><label className={label}>Email</label><input className={input} type="email" value={form.email} onChange={set('email')} /></div>
        <div><label className={label}>City</label><input className={input} value={form.city} onChange={set('city')} /></div>
      </div>
      <div><label className={label}>Address</label><input className={input} value={form.line1} onChange={set('line1')} /></div>
      <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save customer'}</button>
    </form>
  )
}

function NewCustomer({ token, tenant, onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', line1: '', city: '' })
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
      await api.createCustomer(token, {
        tenant_id: tenant,
        name: form.name,
        contact: { phone: form.phone || undefined, email: form.email || undefined },
        address: { line1: form.line1 || undefined, city: form.city || undefined },
      })
      setOk(`Customer ${form.name} created.`)
      setForm({ name: '', phone: '', email: '', line1: '', city: '' })
      onDone()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add customer">
      <Notice>{ok}</Notice>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={set('name')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={set('phone')} /></div>
          <div><label className={label}>Email</label><input className={input} type="email" value={form.email} onChange={set('email')} /></div>
        </div>
        <div><label className={label}>Address</label><input className={input} value={form.line1} onChange={set('line1')} /></div>
        <div><label className={label}>City</label><input className={input} value={form.city} onChange={set('city')} /></div>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={btn}>{busy ? 'Creating…' : 'Create customer'}</button>
          <button type="button" onClick={onCancel} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </Card>
  )
}
