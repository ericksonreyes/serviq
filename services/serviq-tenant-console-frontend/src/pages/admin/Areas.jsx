import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, btn, btnDanger, input, label } from '../../components/ui'

// Service areas — the geographic descriptors used for agent eligibility
// and dispatch recommendations.
export default function Areas() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data: areas, error, loading, reload } = useLoader(
    async () => rows(await api.serviceAreas(token, tenant)), [token, tenant],
  )
  const [err, setErr] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      if (editing) {
        await api.updateServiceArea(token, tenant, editing, form)
      } else {
        await api.createServiceArea(token, tenant, form)
      }
      setForm({ name: '', description: '' })
      setEditing(null)
      reload()
    } catch (e2) {
      setErr(e2.fields ? Object.values(e2.fields).flat()[0] : e2.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    setErr(null)
    try {
      await api.deleteServiceArea(token, tenant, id)
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Service areas</h1>
      <ErrorBox error={error} />
      <ErrorBox error={err} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Coverage">
            {loading ? <Loading /> : !areas || areas.length === 0 ? <Empty text="No service areas configured." /> : (
              <>
              <div className="hidden sm:block overflow-x-auto"><table className="w-full">
                <thead><tr className="border-b border-slate-200"><Th>Name</Th><Th>Description / geo</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {areas.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 text-sm font-medium">{a.name}</td>
                      <td className="px-3 py-2 text-sm">{a.description || a.geo || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { setEditing(a.id); setForm({ name: a.name, description: a.description || '' }) }} className="mr-2 text-sm font-medium text-violet-700 hover:underline">Edit</button>
                        <button onClick={() => remove(a.id)} className={btnDanger}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="sm:hidden divide-y divide-slate-100">
                {areas.map((a) => (
                  <div key={a.id} className="space-y-1.5 px-1 py-3">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-sm text-slate-600">{a.description || a.geo || '—'}</div>
                    <div className="flex gap-3 pt-1">
                      <button onClick={() => { setEditing(a.id); setForm({ name: a.name, description: a.description || '' }) }} className="text-sm font-medium text-violet-700 hover:underline">Edit</button>
                      <button onClick={() => remove(a.id)} className="text-sm font-medium text-red-700 hover:underline">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </Card>
        </div>
        <Card title={editing ? 'Edit area' : 'Add area'}>
          <form onSubmit={submit} className="space-y-3">
            <div><label className={label}>Name</label><input className={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={label}>Description / geo descriptor</label><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex gap-3">
              <button type="submit" disabled={busy} className={btn}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add area'}</button>
              {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', description: '' }) }} className={btnDanger}>Cancel</button>}
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
