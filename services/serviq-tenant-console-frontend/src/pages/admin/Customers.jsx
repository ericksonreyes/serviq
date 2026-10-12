import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, btn, input, label } from '../../components/ui'
import InviteForm from '../../components/InviteForm'

// Customer records — dispatcher/admin creates the account on invitation;
// the customer logs in on the Customer Portal.
export default function Customers() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data: customers, error, loading, reload } = useLoader(
    async () => rows(await api.customers(token, tenant)), [token, tenant],
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Customer list">
            {loading ? <Loading /> : !customers || customers.length === 0 ? <Empty /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th>Name</Th><Th>Contact</Th><Th>Address</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 text-sm font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-sm">
                        {[c.contact?.phone, c.contact?.email].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {[c.address?.line1, c.address?.city].filter(Boolean).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {customers.map((c) => (
                  <div key={c.id} className="space-y-1 px-1 py-3">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-sm text-slate-600">{[c.contact?.phone, c.contact?.email].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="text-xs text-slate-500">{[c.address?.line1, c.address?.city].filter(Boolean).join(', ') || '—'}</div>
                  </div>
                ))}
              </div>
              </>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <NewCustomer token={token} tenant={tenant} onDone={reload} />
          <InviteForm token={token} tenant={tenant} role="Customer" />
        </div>
      </div>
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>

function NewCustomer({ token, tenant, onDone }) {
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
        <button type="submit" disabled={busy} className={btn}>{busy ? 'Creating…' : 'Create customer'}</button>
      </form>
    </Card>
  )
}
