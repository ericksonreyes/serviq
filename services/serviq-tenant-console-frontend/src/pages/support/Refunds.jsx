import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import ChatPanel from '../../components/ChatPanel'
import { Card, Empty, ErrorBox, Loading, StatusBadge, fmtDate, money } from '../../components/ui'

// Refund desk — billing refund requests alongside recorded support
// decisions, plus invoice/revenue context for the reviewer.
export default function Refunds() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading } = useLoader(async () => {
    const [refunds, decisions, invoices] = await Promise.all([
      api.refundRequests(token, tenant).catch(() => []),
      api.refundDecisions(token, tenant).catch(() => []),
      api.invoices(token, tenant).catch(() => []),
    ])
    return { refunds: rows(refunds), decisions: rows(decisions), invoices: rows(invoices) }
  }, [token, tenant])

  const revenue = data ? {
    expected: data.invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.amount_cents, 0),
    remitted: data.invoices.filter((i) => i.status === 'remitted').reduce((s, i) => s + i.amount_cents, 0),
    refunded: data.invoices.filter((i) => i.status === 'refunded').reduce((s, i) => s + i.amount_cents, 0),
  } : null

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Refunds & revenue</h1>
      <ErrorBox error={error} />
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Expected (issued)" value={money(revenue.expected)} />
          <Stat label="Remitted" value={money(revenue.remitted)} />
          <Stat label="Refunded" value={money(revenue.refunded)} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Refund requests">
          {loading ? <Loading /> : !data || data.refunds.length === 0 ? <Empty text="No refund requests." /> : (
            <>
            <div className="hidden sm:block overflow-x-auto"><table className="w-full">
              <thead><tr className="border-b border-slate-200"><Th>Invoice</Th><Th>Reason</Th><Th>Status</Th><Th>Requested</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.refunds.map((r) => (
                  <tr key={r.id}>
                    <Td><span className="font-mono text-xs">{r.invoice_id?.slice(0, 12)}…</span></Td>
                    <Td>{r.reason || '—'}</Td>
                    <Td><StatusBadge value={r.status} /></Td>
                    <Td>{fmtDate(r.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="sm:hidden divide-y divide-slate-100">
              {data.refunds.map((r) => (
                <div key={r.id} className="space-y-1 px-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{r.invoice_id?.slice(0, 12)}…</span>
                    <StatusBadge value={r.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{r.reason || '—'}</span>
                    <span className="text-xs text-slate-500">{fmtDate(r.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
          <p className="mt-2 text-xs text-slate-400">Approve or reject on the linked case — open Cases and record a refund decision.</p>
        </Card>
        <Card title="Recorded decisions">
          {loading ? <Loading /> : !data || data.decisions.length === 0 ? <Empty text="No decisions recorded." /> : (
            <>
            <div className="hidden sm:block overflow-x-auto"><table className="w-full">
              <thead><tr className="border-b border-slate-200"><Th>Case</Th><Th>Invoice</Th><Th>Amount</Th><Th>Decision</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.decisions.map((d) => (
                  <tr key={d.id}>
                    <Td><span className="font-mono text-xs">{d.case_id?.slice(0, 12)}…</span></Td>
                    <Td><span className="font-mono text-xs">{d.invoice_id?.slice(0, 12)}…</span></Td>
                    <Td>{money(d.amount_cents)}</Td>
                    <Td><StatusBadge value={d.decision} /></Td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="sm:hidden divide-y divide-slate-100">
              {data.decisions.map((d) => (
                <div key={d.id} className="space-y-1 px-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{money(d.amount_cents)}</span>
                    <StatusBadge value={d.decision} />
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    case {d.case_id?.slice(0, 12)}… · inv {d.invoice_id?.slice(0, 12)}…
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </Card>
        <Card title="Invoices" className="xl:col-span-2">
          {loading ? <Loading /> : !data || data.invoices.length === 0 ? <Empty text="No invoices." /> : (
            <>
            <div className="hidden sm:block overflow-x-auto"><table className="w-full">
              <thead><tr className="border-b border-slate-200"><Th>Invoice</Th><Th>Amount</Th><Th>Status</Th><Th>Issued</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <Td><span className="font-mono text-xs">{i.id}</span></Td>
                    <Td>{money(i.amount_cents, i.currency)}</Td>
                    <Td><StatusBadge value={i.status} /></Td>
                    <Td>{fmtDate(i.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="sm:hidden divide-y divide-slate-100">
              {data.invoices.map((i) => (
                <div key={i.id} className="space-y-1 px-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">{i.id}</span>
                    <StatusBadge value={i.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{money(i.amount_cents, i.currency)}</span>
                    <span className="text-xs text-slate-500">{fmtDate(i.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </Card>
      </div>
      <ChatPanel profile="support" title="Support assistant" />
    </div>
  )
}

const Stat = ({ label, value }) => (
  <div className="rounded-xl bg-white p-4 shadow">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
  </div>
)
const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
const Td = ({ children }) => <td className="px-3 py-2 text-sm text-slate-700">{children}</td>
