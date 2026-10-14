import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, btn, label, link, money, select } from '../../components/ui'

// Deposit batch remittance — one money task per page (see Remittances
// index).
export default function RemittanceDeposit() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading, reload } = useLoader(async () => ({
    invoices: rows(await api.invoices(token, tenant).catch(() => [])),
    evidence: rows(await api.paymentEvidence(token, tenant).catch(() => [])),
  }), [token, tenant])

  return (
    <div className="space-y-4">
      <PageHead title="Deposit batch remittance" desc="Reconcile an over-the-counter bank deposit — the covered collections should add up to the slip's total." />
      <Link to="/dispatch/remittances" className={link}>← Back to remittances</Link>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? <Empty /> : (
        <Card title="Submit a batch" desc="Pick the parsed deposit slip, then tick the cash collections it covers.">
          <BatchForm token={token} tenant={tenant} invoices={data.invoices} evidence={data.evidence} onDone={reload} />
        </Card>
      )}
    </div>
  )
}

function BatchForm({ token, tenant, invoices, evidence, onDone }) {
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
    <>
      <ErrorBox error={err} />
      <Notice>{ok}</Notice>
      <label className={label}>Bank deposit slip (parsed evidence)</label>
      <select className={select} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}>
        <option value="">Select evidence…</option>
        {slips.map((e) => (
          <option key={e.id} value={e.id}>
            {e.extracted?.reference || e.id.slice(0, 12)} — {money(e.extracted?.amount_cents)}
          </option>
        ))}
      </select>
      {slips.length === 0 && <p className="mt-1 text-xs text-slate-400">No deposit slips on file — upload one via the dispatcher command box (remittance_evidence_upload).</p>}
      <label className={`${label} mt-3`}>Covered cash collections</label>
      <ul className="mt-1 max-h-96 space-y-1 overflow-y-auto">
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
    </>
  )
}
