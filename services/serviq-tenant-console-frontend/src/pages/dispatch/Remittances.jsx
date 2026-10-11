import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, StatusBadge, btn, btnGhost, input, label, money } from '../../components/ui'

// Remittance desk — cash turn-ins, digital-payment remittance, deposit
// batches, and manual review of flagged records. Money flows require
// explicit confirmation (see ui-ux skill).
export default function Remittances() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading, reload } = useLoader(async () => {
    const [remittances, agents, invoices, evidence] = await Promise.all([
      api.remittances(token, tenant),
      api.agents(token, tenant).catch(() => []),
      api.invoices(token, tenant).catch(() => []),
      api.paymentEvidence(token, tenant).catch(() => []),
    ])
    return { remittances: rows(remittances), agents: rows(agents), invoices: rows(invoices), evidence: rows(evidence) }
  }, [token, tenant])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Remittances</h1>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? <Empty /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TurnIn token={token} tenant={tenant} agents={data.agents} onDone={reload} />
          <DigitalRemit token={token} tenant={tenant} invoices={data.invoices} onDone={reload} />
          <BatchRemit token={token} tenant={tenant} invoices={data.invoices} evidence={data.evidence} onDone={reload} />
          <RemittanceList token={token} tenant={tenant} list={data.remittances} onDone={reload} />
        </div>
      )}
    </div>
  )
}

const Th = ({ children }) => <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
const Td = ({ children }) => <td className="px-2 py-1.5 text-sm text-slate-700">{children}</td>

function TurnIn({ token, tenant, agents, onDone }) {
  const [agentId, setAgentId] = useState('')
  const [expected, setExpected] = useState(null)
  const [counted, setCounted] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const loadExpected = async (id) => {
    setAgentId(id)
    setExpected(null)
    setErr(null)
    if (!id) return
    try {
      const res = await api.expectedRemittance(token, tenant, id)
      setExpected(res.data ?? res)
    } catch (e) {
      setErr(e.message)
    }
  }

  const submit = async () => {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.submitTurnIn(token, tenant, {
        agent_id: agentId,
        counted_total_cents: Math.round(Number(counted) * 100),
      })
      setOk('Turn-in submitted for confirmation.')
      setCounted('')
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const expectedTotal = expected?.expected_cents ?? expected?.total_cents
  const items = expected?.items ?? expected?.invoices ?? []

  return (
    <Card title="Cash turn-in">
      <ErrorBox error={err} />
      <Notice>{ok}</Notice>
      <label className={label}>Agent</label>
      <select className={input} value={agentId} onChange={(e) => loadExpected(e.target.value)}>
        <option value="">Select agent…</option>
        {agents.map((a) => <option key={a.id} value={a.agent_id || a.id}>{a.name}</option>)}
      </select>
      {expected && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg bg-slate-50 p-2 text-sm">
            <p className="font-medium">Expected: {money(expectedTotal)} ({items.length} cash-paid services)</p>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-500">
              {items.map((i, idx) => (
                <li key={i.id ?? idx} className="flex justify-between">
                  <span className="font-mono">{(i.invoice_id || i.id || '').slice(0, 12)}…</span>
                  <span>{money(i.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className={label}>Counted total (PHP)</label>
            <input className={input} type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} />
            {counted && expectedTotal != null && Number(counted) * 100 !== expectedTotal && (
              <p className="mt-1 text-xs text-amber-600">
                Variance of {money(Math.abs(Math.round(Number(counted) * 100) - expectedTotal))} — will need dispatcher confirmation.
              </p>
            )}
          </div>
          <button onClick={submit} disabled={busy || !counted} className={btn}>{busy ? 'Submitting…' : 'Submit turn-in'}</button>
          <p className="text-xs text-slate-400">Photograph the laid-out cash and count it via the dispatcher command box (cash_turnin_count), then enter the total here.</p>
        </div>
      )}
    </Card>
  )
}

function DigitalRemit({ token, tenant, invoices, onDone }) {
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const paid = invoices.filter((i) => i.status === 'paid')

  const submit = async () => {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.markDigital(token, tenant, sel)
      setOk(`${sel.length} invoice(s) marked remitted.`)
      setSel([])
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Digital payments → remitted">
      <ErrorBox error={err} />
      <Notice>{ok}</Notice>
      {paid.length === 0 ? <Empty text="No validated digital payments awaiting remittance." /> : (
        <>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {paid.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))} />
                <span className="font-mono text-xs">{i.id.slice(0, 12)}…</span>
                <span className="ml-auto">{money(i.amount_cents, i.currency)}</span>
              </li>
            ))}
          </ul>
          <button onClick={submit} disabled={busy || sel.length === 0} className={`${btn} mt-3`}>
            {busy ? 'Marking…' : `Mark ${sel.length || ''} as remitted`}
          </button>
        </>
      )}
    </Card>
  )
}

function BatchRemit({ token, tenant, invoices, evidence, onDone }) {
  const slips = evidence.filter((e) => e.document_type === 'BANK_SLIP' || e.document_type === 'bank_slip')
  const cashPaid = invoices.filter((i) => i.status === 'paid')
  const [evidenceId, setEvidenceId] = useState('')
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await api.submitBatch(token, tenant, { evidence_id: evidenceId, invoice_ids: sel })
      setOk('Deposit batch submitted.')
      setSel([])
      setEvidenceId('')
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Deposit batch remittance">
      <ErrorBox error={err} />
      <Notice>{ok}</Notice>
      <label className={label}>Bank deposit slip (parsed evidence)</label>
      <select className={input} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}>
        <option value="">Select evidence…</option>
        {slips.map((e) => (
          <option key={e.id} value={e.id}>
            {e.extracted?.reference || e.id.slice(0, 12)} — {money(e.extracted?.amount_cents)}
          </option>
        ))}
      </select>
      {slips.length === 0 && <p className="mt-1 text-xs text-slate-400">No deposit slips on file — upload one via the dispatcher command box (remittance_evidence_upload).</p>}
      <label className={`${label} mt-3`}>Covered cash collections</label>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
        {cashPaid.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))} />
            <span className="font-mono text-xs">{i.id.slice(0, 12)}…</span>
            <span className="ml-auto">{money(i.amount_cents, i.currency)}</span>
          </li>
        ))}
      </ul>
      <button onClick={submit} disabled={busy || !evidenceId || sel.length === 0} className={`${btn} mt-3`}>
        {busy ? 'Submitting…' : 'Submit batch'}
      </button>
    </Card>
  )
}

function RemittanceList({ token, tenant, list, onDone }) {
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
    <Card title={`Remittance records${list.length ? ` (${list.length})` : ''}`} className="xl:col-span-2">
      <ErrorBox error={err} />
      {list.length === 0 ? <Empty text="No remittances yet." /> : (
        <table className="w-full">
          <thead><tr className="border-b border-slate-200"><Th>Kind</Th><Th>Expected</Th><Th>Counted</Th><Th>Variance</Th><Th>Flags</Th><Th>Status</Th><Th>Review</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((r) => {
              const reviewable = r.status === 'pending_confirmation' || r.status === 'manual_review'
              return (
                <tr key={r.id} className={r.status === 'manual_review' ? 'bg-red-50' : ''}>
                  <Td>{(r.kind || '').replace(/_/g, ' ')}</Td>
                  <Td>{money(r.expected_cents)}</Td>
                  <Td>{money(r.counted_cents ?? r.total_cents)}</Td>
                  <Td className={r.variance_cents ? 'text-amber-700' : ''}>{r.variance_cents ? money(r.variance_cents) : '—'}</Td>
                  <Td>{(r.flags || []).length ? <span className="text-xs text-red-600">{r.flags.join(', ')}</span> : '—'}</Td>
                  <Td><StatusBadge value={r.status} /></Td>
                  <Td>
                    {reviewable && (
                      <div className="space-y-1">
                        <input className="w-40 rounded border border-slate-300 px-1.5 py-1 text-xs" placeholder="Note (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => confirm(r.id, 'confirm')} disabled={!!busy} className={btn}>Confirm</button>
                          <button onClick={() => confirm(r.id, 'override')} disabled={!!busy} className={btnGhost}>Override</button>
                          <button onClick={() => confirm(r.id, 'accept_shortfall')} disabled={!!busy} className={btnGhost}>Accept shortfall</button>
                          <button onClick={() => confirm(r.id, 'reject')} disabled={!!busy} className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reject</button>
                        </div>
                      </div>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}
