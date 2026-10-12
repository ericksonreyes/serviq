import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, ErrorBox, STATUS_TONE, card } from '../ui'

function Stat({ title, value, children }) {
  return (
    <div className={card}>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value ?? '—'}</div>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { token } = useAuth()
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .metricsSummary(token)
      .then((res) => setMetrics(res.data))
      .catch((err) => setError(err.message))
  }, [token])

  const chips = (obj) =>
    Object.entries(obj || {}).map(([status, count]) => (
      <Badge key={status} tone={STATUS_TONE[status] || 'slate'}>
        {status}: {count}
      </Badge>
    ))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Platform metrics</h1>
      <ErrorBox error={error} />
      {!metrics && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {metrics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat title="Service providers" value={metrics.tenants?.total}>
            {chips(metrics.tenants?.by_status)}
          </Stat>
          <Stat title="Subscription plans" value={metrics.plans?.total}>
            <Badge tone="green">active: {metrics.plans?.active ?? 0}</Badge>
          </Stat>
          <Stat title="Subscriptions" value={metrics.subscriptions?.total}>
            {chips(metrics.subscriptions?.by_status)}
          </Stat>
          <Stat title="Feature flags" value={metrics.feature_flags?.total}>
            <Badge tone="green">enabled: {metrics.feature_flags?.enabled ?? 0}</Badge>
          </Stat>
          <Stat
            title="IAM users"
            value={metrics.users?.available ? metrics.users.total : '—'}
          >
            {!metrics.users?.available && <Badge>count unavailable</Badge>}
          </Stat>
        </div>
      )}
    </div>
  )
}
