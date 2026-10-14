import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, StatusBadge, link, linkDanger, money } from '../../components/ui'

// Remittance desk index — the records ledger is the default view; each
// money-movement task gets its own page so the dispatcher isn't juggling
// unrelated forms side by side. Money flows require explicit
// confirmation (see ui-ux skill).
export default function Remittances() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoader(async () => {
    const remittances = await api.remittances(token, tenant, page)
    return { remittances: rows(remittances), remMeta: remittances }
  }, [token, tenant, page])

  return (
    <div className="space-y-4">
      <PageHead title="Remittances" desc="Agent turn-ins and over-the-counter deposits awaiting confirmation — nothing counts as received until a record here is reviewed." />
      <ErrorBox error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TaskLink
          to="/dispatch/remittances/turn-in"
          title="Cash turn-in"
          desc="Log the physical cash an agent hands in at shift end."
        />
        <TaskLink
          to="/dispatch/remittances/turn-in?channel=wallet"
          title="Transfer turn-in"
          desc="Settle an agent's held collections from a transfer receipt — e-wallet, bank deposit, or remittance center."
        />
        <TaskLink
          to="/dispatch/remittances/digital"
          title="Digital payments → remitted"
          desc="Mark validated digital payments as landed in the company account."
        />
        <TaskLink
          to="/dispatch/remittances/deposit-batch"
          title="Deposit batch remittance"
          desc="Reconcile an over-the-counter bank deposit against cash collections."
        />
      </div>
      {loading ? <Loading /> : !data ? <Empty /> : (
        <RemittanceList token={token} tenant={tenant} list={data.remittances} meta={data.remMeta} onPage={setPage} onDone={reload} />
      )}
    </div>
  )
}

function TaskLink({ to, title, desc }) {
  return (
    <Link to={to} className="block rounded-xl bg-white p-4 shadow transition hover:shadow-md">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
      <span className="mt-2 inline-block text-sm font-medium text-violet-700">Open →</span>
    </Link>
  )
}

const Th = ({ children }) => <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
const Td = ({ children }) => <td className="px-2 py-1.5 text-sm text-slate-700">{children}</td>

function RemittanceList({ token, tenant, list, meta, onPage, onDone }) {
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const [notes, setNotes] = useState({})

  const confirm = async (id, decision) => {
    setBusy(id + decision)
    setErr(null)
    try {
      await api.confirmRemittance(token, tenant, id, { decision, notes: notes[id] || undefined })
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title={`Remittance records${meta?.total ? ` (${meta.total})` : list.length ? ` (${list.length})` : ''}`} desc="Every submitted turn-in and batch lands here awaiting confirmation. Confirm clean records; override, accept the shortfall, or reject flagged ones (flagged rows highlight red).">
      <ErrorBox error={err} />
      <Pager meta={meta} onPage={onPage} top />
      {list.length === 0 ? <Empty text="No remittances yet." /> : (
        <>
        <div className="hidden sm:block overflow-x-auto"><table className="w-full">
          <thead><tr className="border-b border-slate-200"><Th>Kind</Th><Th>Expected</Th><Th>Counted</Th><Th>Variance</Th><Th>Flags</Th><Th>Status</Th><Th>Review</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((r) => {
              const reviewable = r.status === 'pending_confirmation' || r.status === 'manual_review'
              return (
                <tr key={r.id} className={r.status === 'manual_review' ? 'bg-red-50' : ''}>
                  <Td>{(r.kind || '').replace(/_/g, ' ')}{r.channel && r.channel !== 'cash' ? ` · ${r.channel.replace(/_/g, ' ')}` : ''}</Td>
                  <Td>{money(r.expected_cents)}</Td>
                  <Td>{money(r.counted_cents ?? r.total_cents)}</Td>
                  <Td className={r.variance_cents ? 'text-amber-700' : ''}>{r.variance_cents ? money(r.variance_cents) : '—'}</Td>
                  <Td>{(r.flags || []).length ? <span className="text-sm text-red-600">{r.flags.join(', ')}</span> : '—'}</Td>
                  <Td><StatusBadge value={r.status} /></Td>
                  <Td>
                    {reviewable ? (
                      <div className="space-y-1">
                        <input className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Note (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                        <div className="flex flex-wrap gap-3">
                          <button onClick={() => confirm(r.id, 'confirm')} disabled={!!busy} className={link}>Confirm</button>
                          <button onClick={() => confirm(r.id, 'override')} disabled={!!busy} className={link}>Override</button>
                          <button onClick={() => confirm(r.id, 'accept_shortfall')} disabled={!!busy} className={link}>Accept shortfall</button>
                          <button onClick={() => confirm(r.id, 'reject')} disabled={!!busy} className={linkDanger}>Reject</button>
                          {r.evidence_id && <button onClick={() => api.openEvidenceFile(token, tenant, r.evidence_id).catch(() => {})} className={link}>Receipt</button>}
                        </div>
                      </div>
                    ) : (
                      r.evidence_id && <button onClick={() => api.openEvidenceFile(token, tenant, r.evidence_id).catch(() => {})} className={link}>Receipt</button>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        <div className="sm:hidden divide-y divide-slate-100">
          {list.map((r) => {
            const reviewable = r.status === 'pending_confirmation' || r.status === 'manual_review'
            return (
              <div key={r.id} className={`space-y-1.5 px-2 py-3 ${r.status === 'manual_review' ? 'bg-red-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{(r.kind || '').replace(/_/g, ' ')}{r.channel && r.channel !== 'cash' ? ` · ${r.channel.replace(/_/g, ' ')}` : ''}</span>
                  <StatusBadge value={r.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>expected {money(r.expected_cents)}</span>
                  <span>counted {money(r.counted_cents ?? r.total_cents)}</span>
                  {r.variance_cents ? <span className="text-amber-700">var {money(r.variance_cents)}</span> : null}
                </div>
                {(r.flags || []).length > 0 && <div className="text-sm text-red-600">{r.flags.join(', ')}</div>}
                {reviewable && (
                  <div className="space-y-2 pt-1">
                    <input className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Note (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => confirm(r.id, 'confirm')} disabled={!!busy} className={link}>Confirm</button>
                      <button onClick={() => confirm(r.id, 'override')} disabled={!!busy} className={link}>Override</button>
                      <button onClick={() => confirm(r.id, 'accept_shortfall')} disabled={!!busy} className={link}>Accept shortfall</button>
                      <button onClick={() => confirm(r.id, 'reject')} disabled={!!busy} className={linkDanger}>Reject</button>
                      {r.evidence_id && <button onClick={() => api.openEvidenceFile(token, tenant, r.evidence_id).catch(() => {})} className={link}>Receipt</button>}
                    </div>
                  </div>
                )}
                {!reviewable && r.evidence_id && (
                  <button onClick={() => api.openEvidenceFile(token, tenant, r.evidence_id).catch(() => {})} className={link}>View receipt</button>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
      <Pager meta={meta} onPage={onPage} />
    </Card>
  )
}
