import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, StatusBadge, btn, money, fmtDate } from '../../components/ui'

const TABS = ['Invoices', 'Refund requests', 'Payouts']

// Revenue view — invoices, refund requests (with execute for approved
// refunds), and agent payout status.
export default function Finance() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [tab, setTab] = useState('Invoices')
  const { data, error, loading, reload } = useLoader(async () => {
    const [invoices, refunds, payouts] = await Promise.all([
      api.invoices(token, tenant),
      api.refundRequests(token, tenant).catch(() => []),
      api.payouts(token, tenant).catch(() => []),
    ])
    return { invoices: rows(invoices), refunds: rows(refunds), payouts: rows(payouts) }
  }, [token, tenant])

  const totals = data ? {
    issued: data.invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.amount_cents, 0),
    collected: data.invoices.filter((i) => ['paid', 'remitted'].includes(i.status)).reduce((s, i) => s + i.amount_cents, 0),
    refunded: data.invoices.filter((i) => i.status === 'refunded').reduce((s, i) => s + i.amount_cents, 0),
  } : null

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Revenue & payouts</h1>
      <ErrorBox error={error} />
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Outstanding" value={money(totals.issued)} />
          <Stat label="Collected" value={money(totals.collected)} />
          <Stat label="Refunded" value={money(totals.refunded)} />
        </div>
      )}
      <Card
        title={tab}
        actions={(
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      >
        {loading ? <Loading /> : !data ? <Empty /> : (
          <>
            {tab === 'Invoices' && <Invoices rows={data.invoices} />}
            {tab === 'Refund requests' && <Refunds rows={data.refunds} token={token} tenant={tenant} onDone={reload} />}
            {tab === 'Payouts' && <Payouts rows={data.payouts} />}
          </>
        )}
      </Card>
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

function Invoices({ rows: list }) {
  if (list.length === 0) return <Empty text="No invoices." />
  return (
    <table className="w-full">
      <thead><tr className="border-b border-slate-200"><Th>Invoice</Th><Th>Amount</Th><Th>Status</Th><Th>Issued</Th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {list.map((i) => (
          <tr key={i.id}>
            <Td><span className="font-mono text-xs">{i.id}</span></Td>
            <Td>{money(i.amount_cents, i.currency)}</Td>
            <Td><StatusBadge value={i.status} /></Td>
            <Td>{fmtDate(i.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Refunds({ rows: list, token, tenant, onDone }) {
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)

  const execute = async (id) => {
    setBusy(id)
    setErr(null)
    try {
      await api.executeRefund(token, tenant, id)
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (list.length === 0) return <Empty text="No refund requests." />
  return (
    <>
      <ErrorBox error={err} />
      <table className="w-full">
        <thead><tr className="border-b border-slate-200"><Th>Invoice</Th><Th>Reason</Th><Th>Status</Th><Th>Requested</Th><Th /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((r) => (
            <tr key={r.id}>
              <Td><span className="font-mono text-xs">{r.invoice_id}</span></Td>
              <Td>{r.reason || '—'}</Td>
              <Td><StatusBadge value={r.status} /></Td>
              <Td>{fmtDate(r.created_at)}</Td>
              <Td>
                {r.status === 'approved' && (
                  <button onClick={() => execute(r.id)} disabled={busy === r.id} className={btn}>
                    {busy === r.id ? 'Executing…' : 'Execute refund'}
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function Payouts({ rows: list }) {
  if (list.length === 0) return <Empty text="No payouts." />
  return (
    <table className="w-full">
      <thead><tr className="border-b border-slate-200"><Th>Payout</Th><Th>Agent</Th><Th>Net</Th><Th>Shortfall</Th><Th>Status</Th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {list.map((p) => (
          <tr key={p.id}>
            <Td><span className="font-mono text-xs">{p.id.slice(0, 8)}…</span></Td>
            <Td><span className="font-mono text-xs">{p.agent_id?.slice(0, 8)}…</span></Td>
            <Td>{money(p.net_cents ?? p.amount_cents)}</Td>
            <Td>{p.shortfall_cents ? money(p.shortfall_cents) : '—'}</Td>
            <Td><StatusBadge value={p.status} /></Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
