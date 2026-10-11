import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, ErrorBox, STATUS_TONE, card, money, td, th } from '../ui'

export default function Income() {
  const { token } = useAuth()
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .incomeReport(token)
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.message))
  }, [token])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Income & settlement</h1>
        <p className="mt-1 text-sm text-slate-500">
          Operational income data — platform fee income derived from each tenant's plan and
          subscription status. This is not payment-ledger data; customer billing lives in the
          Billing service.
        </p>
      </div>
      <ErrorBox error={error} />
      {!report && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(report.totals || []).map((t) => (
              <div key={t.currency} className={card}>
                <div className="text-sm font-medium text-slate-500">Platform fee income ({t.currency})</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{money(t.income_cents, t.currency)}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="teal">{t.subscribed_tenants} subscribed</Badge>
                  {t.past_due_cents > 0 && (
                    <Badge tone="red">past due: {money(t.past_due_cents, t.currency)}</Badge>
                  )}
                </div>
              </div>
            ))}
            {(report.totals || []).length === 0 && <Empty>No subscriptions on record.</Empty>}
          </div>
          <table className="w-full overflow-hidden rounded-lg bg-white text-sm shadow">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Tenant</th>
                <th className={th}>Tenant status</th>
                <th className={th}>Plan</th>
                <th className={th}>Fee</th>
                <th className={th}>Subscription</th>
                <th className={th}>Settlement</th>
              </tr>
            </thead>
            <tbody>
              {(report.tenants || []).map((r) => (
                <tr key={r.tenant_id}>
                  <td className={td}>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.slug}</div>
                  </td>
                  <td className={td}>
                    <Badge tone={STATUS_TONE[r.tenant_status]}>{r.tenant_status}</Badge>
                  </td>
                  <td className={td}>{r.plan_name ?? '—'}</td>
                  <td className={td}>{r.price_cents != null ? money(r.price_cents, r.currency) : '—'}</td>
                  <td className={td}>
                    {r.subscription_status ? (
                      <Badge tone={STATUS_TONE[r.subscription_status]}>{r.subscription_status}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={td}>
                    <Badge tone={STATUS_TONE[r.settlement_status]}>{r.settlement_status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
