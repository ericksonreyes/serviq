import { useState } from 'react'
import { api, rows } from '../api'
import { useAuth, useTenant } from '../auth'
import { useLoader } from '../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, btnGhost, fmtDate } from '../components/ui'

// Tenant-wide in-app feed — rows with no user_id are staff traffic
// (coverage demand, job events), so every console user sees them.
export default function Notifications() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoader(
    () => api.notifications(token, tenant, false, page),
    [token, tenant, page]
  )
  const items = rows(data)

  const [marking, setMarking] = useState(false)

  const markRead = async (id) => {
    await api.markNotificationRead(token, tenant, id).catch(() => {})
    reload()
  }

  const markAll = async () => {
    setMarking(true)
    await api.markAllNotificationsRead(token, tenant).catch(() => {})
    setMarking(false)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHead title="Notifications" desc="Operational events and demand signals for this provider." />
        {items.some((n) => !n.read_at) && (
          <button onClick={markAll} disabled={marking} className={btnGhost}>
            {marking ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      <Card>
        <Pager meta={data} onPage={setPage} top />
        {loading ? <Loading /> : items.length === 0 ? <Empty text="No notifications yet." /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-slate-200' : 'bg-violet-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read_at ? 'text-slate-600' : 'font-medium text-slate-900'}`}>{n.title}</p>
                  <p className="text-sm text-slate-500">{n.body}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{fmtDate(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <button onClick={() => markRead(n.id)} className="shrink-0 text-xs text-violet-700 hover:underline">
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager meta={data} onPage={setPage} />
      </Card>
    </div>
  )
}
