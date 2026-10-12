import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import CommandBox from '../../components/CommandBox'
import { Card, Empty, ErrorBox, Loading, StatusBadge, btn, btnGhost } from '../../components/ui'

// Dispatcher home — the NL command box plus the live dispatch queue.
export default function Dashboard() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data: queue, error, loading, reload } = useLoader(
    async () => rows(await api.dispatchQueue(token, tenant)), [token, tenant],
  )
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)

  const broadcast = async (job_id) => {
    setBusy(job_id)
    setErr(null)
    try {
      await api.dispatchBroadcast(token, tenant, { job_id })
      reload()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Dispatch</h1>
      <CommandBox />
      <ErrorBox error={error} />
      <ErrorBox error={err} />
      <Card title={`Dispatch queue${queue ? ` (${queue.length})` : ''}`}>
        {loading ? <Loading /> : !queue || queue.length === 0 ? <Empty text="Queue is clear — no jobs waiting for assignment." /> : (
          <>
          <div className="hidden sm:block overflow-x-auto"><table className="w-full">
            <thead><tr className="border-b border-slate-200"><Th>Job</Th><Th>Status</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {queue.map((j) => (
                <tr key={j.job_id || j.id}>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-700">{j.job_id || j.id}</span></td>
                  <td className="px-3 py-2"><StatusBadge value={j.status} /></td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/dispatch/jobs?job=${j.job_id || j.id}`} className={`${btnGhost} mr-2 inline-block`}>Assign</Link>
                    <button onClick={() => broadcast(j.job_id || j.id)} disabled={busy === (j.job_id || j.id)} className={btn}>
                      {busy === (j.job_id || j.id) ? 'Broadcasting…' : 'Broadcast offers'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="sm:hidden divide-y divide-slate-100">
            {queue.map((j) => (
              <div key={j.job_id || j.id} className="space-y-2 px-1 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-slate-700">{j.job_id || j.id}</span>
                  <StatusBadge value={j.status} />
                </div>
                <div className="flex gap-2">
                  <Link to={`/dispatch/jobs?job=${j.job_id || j.id}`} className={`${btnGhost} inline-block`}>Assign</Link>
                  <button onClick={() => broadcast(j.job_id || j.id)} disabled={busy === (j.job_id || j.id)} className={btn}>
                    {busy === (j.job_id || j.id) ? 'Broadcasting…' : 'Broadcast offers'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </Card>
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
