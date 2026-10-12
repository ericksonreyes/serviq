import { api, rows } from '../api'
import { useAuth, useTenant } from '../auth'
import { useLoader } from '../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, StatusBadge, money } from '../components/ui'

// Operations summary — the tenant's reports view, built from the existing
// list endpoints (requests, jobs, invoices, remittances).
export default function Home() {
  const { token, claims } = useAuth()
  const tenant = useTenant()
  const { data, error, loading } = useLoader(async () => {
    const [requests, jobs, invoices, remittances, payouts] = await Promise.all([
      api.requests(token, tenant), api.jobs(token, tenant), api.invoices(token, tenant),
      api.remittances(token, tenant), api.payouts(token, tenant).catch(() => []),
    ])
    return { requests: rows(requests), jobs: rows(jobs), invoices: rows(invoices), remittances: rows(remittances), payouts: rows(payouts) }
  }, [token, tenant])

  const stats = data ? {
    openRequests: data.requests.filter((r) => r.status === 'submitted' || r.status === 'reviewed').length,
    activeJobs: data.jobs.filter((j) => !['completed', 'cancelled'].includes(j.status)).length,
    expected: data.invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + (i.amount_cents ?? 0), 0),
    collected: data.invoices.filter((i) => ['paid', 'remitted'].includes(i.status)).reduce((s, i) => s + (i.amount_cents ?? 0), 0),
    pendingRemittance: data.remittances.filter((r) => r.status !== 'remitted' && r.status !== 'rejected').length,
    pendingPayouts: data.payouts.filter((p) => p.status !== 'settled').reduce((s, p) => s + (p.net_cents ?? p.amount_cents ?? 0), 0),
  } : null

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <PageHead title="Overview" desc="Live picture of today — queue depth, open cases, money in flight." />
        <p className="text-sm text-slate-500">{(claims?.roles || []).join(' · ')}</p>
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? <Empty /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Open requests" value={stats.openRequests} />
            <Stat label="Active jobs" value={stats.activeJobs} />
            <Stat label="Pending remittances" value={stats.pendingRemittance} />
            <Stat label="Payouts due" value={money(stats.pendingPayouts)} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Revenue">
              <dl className="space-y-2 text-sm">
                <Row k="Expected (issued invoices)" v={money(stats.expected)} />
                <Row k="Collected (paid + remitted)" v={money(stats.collected)} />
                <Row k="Invoices on file" v={data.invoices.length} />
              </dl>
            </Card>
            <Card title="Latest invoices">
              {data.invoices.length === 0 ? <Empty text="No invoices yet." /> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.invoices.slice(0, 6).map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-1.5">
                      <span className="font-mono text-xs text-slate-500">{i.id.slice(0, 8)}…</span>
                      <span>{money(i.amount_cents, i.currency)}</span>
                      <StatusBadge value={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

const Stat = ({ label, value }) => (
  <div className="rounded-xl bg-white p-4 shadow">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
  </div>
)
const Row = ({ k, v }) => (
  <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
)
