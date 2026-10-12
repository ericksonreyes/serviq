import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, StatusBadge, link, money, fmtDate } from '../../components/ui'

const TABS = ['Invoices', 'Refund requests', 'Payouts']

// Revenue view — invoices, refund requests (with execute for approved
// refunds), and agent payout status.
export default function Finance() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [tab, setTab] = useState('Invoices')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoader(async () => {
    const [invoices, refunds, payouts] = await Promise.all([
      api.invoices(token, tenant, '', page),
      api.refundRequests(token, tenant, page).catch(() => []),
      api.payouts(token, tenant, page).catch(() => []),
    ])
    return { invoices: rows(invoices), refunds: rows(refunds), payouts: rows(payouts), metas: { Invoices: invoices, 'Refund requests': refunds, Payouts: payouts } }
  }, [token, tenant, page])

  const totals = data ? {
    issued: data.invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.amount_cents, 0),
    collected: data.invoices.filter((i) => ['paid', 'remitted'].includes(i.status)).reduce((s, i) => s + i.amount_cents, 0),
    refunded: data.invoices.filter((i) => i.status === 'refunded').reduce((s, i) => s + i.amount_cents, 0),
  } : null

  return (
    <div className="space-y-4">
      <PageHead title="Revenue & payouts" desc="Invoices, settlements, and money owed to agents." />
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
              <button key={t} onClick={() => { setTab(t); setPage(1) }} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-violet-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      >
        {loading ? <Loading /> : !data ? <Empty /> : (
          <>
            <Pager meta={data.metas[tab]} onPage={setPage} top />
            {tab === 'Invoices' && <Invoices rows={data.invoices} />}
            {tab === 'Refund requests' && <Refunds rows={data.refunds} token={token} tenant={tenant} onDone={reload} />}
            {tab === 'Payouts' && <Payouts rows={data.payouts} token={token} tenant={tenant} onDone={reload} />}
            <Pager meta={data.metas[tab]} onPage={setPage} />
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
    <>
      <div className="hidden sm:block overflow-x-auto"><table className="w-full">
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
      </table></div>
      <div className="sm:hidden divide-y divide-slate-100">
        {list.map((i) => (
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
      <div className="hidden sm:block overflow-x-auto"><table className="w-full">
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
                  <button onClick={() => execute(r.id)} disabled={busy === r.id} className={link}>
                    {busy === r.id ? 'Executing…' : 'Execute refund'}
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="sm:hidden divide-y divide-slate-100">
        {list.map((r) => (
          <div key={r.id} className="space-y-1.5 px-1 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs">{r.invoice_id}</span>
              <StatusBadge value={r.status} />
            </div>
            <div className="text-sm text-slate-600">{r.reason || '—'}</div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{fmtDate(r.created_at)}</span>
              {r.status === 'approved' && (
                <button onClick={() => execute(r.id)} disabled={busy === r.id} className={link}>
                  {busy === r.id ? 'Executing…' : 'Execute refund'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function Payouts({ rows: list, token, tenant, onDone }) {
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)

  const settle = async (id) => {
    setBusy(id)
    setErr(null)
    try {
      await api.settlePayout(token, tenant, id)
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (list.length === 0) return <Empty text="No payouts." />
  return (
    <>
      <ErrorBox error={err} />
      <div className="hidden sm:block overflow-x-auto"><table className="w-full">
        <thead><tr className="border-b border-slate-200"><Th>Payout</Th><Th>Agent</Th><Th>Net</Th><Th>Shortfall</Th><Th>Status</Th><Th /></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((p) => (
            <tr key={p.id}>
              <Td><span className="font-mono text-xs">{p.id.slice(0, 8)}…</span></Td>
              <Td><span className="font-mono text-xs">{p.agent_id?.slice(0, 8)}…</span></Td>
              <Td>{money(p.net_cents ?? p.amount_cents)}</Td>
              <Td>{p.shortfall_cents ? money(p.shortfall_cents) : '—'}</Td>
              <Td><StatusBadge value={p.status} /></Td>
              <Td>
                {p.status === 'pending' && (
                  <button onClick={() => settle(p.id)} disabled={busy === p.id} className={link}>
                    {busy === p.id ? 'Settling…' : 'Settle'}
                  </button>
                )}
                {p.disbursement_ref && <span className="font-mono text-xs text-slate-500">{p.disbursement_ref}</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="sm:hidden divide-y divide-slate-100">
        {list.map((p) => (
          <div key={p.id} className="space-y-1.5 px-1 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{p.id.slice(0, 8)}…</span>
              <StatusBadge value={p.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">{money(p.net_cents ?? p.amount_cents)}</span>
              {p.shortfall_cents ? <span className="text-amber-700">shortfall {money(p.shortfall_cents)}</span> : null}
              <span className="font-mono text-xs text-slate-500">agent {p.agent_id?.slice(0, 8)}…</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              {p.disbursement_ref && <span className="font-mono text-xs text-slate-500">{p.disbursement_ref}</span>}
              {p.status === 'pending' && (
                <button onClick={() => settle(p.id)} disabled={busy === p.id} className={link}>
                  {busy === p.id ? 'Settling…' : 'Settle'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
