import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, btn, link, money } from '../../components/ui'

// Digital payments → remitted — one money task per page (see Remittances
// index).
export default function RemittanceDigital() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading, reload } = useLoader(async () => ({
    invoices: rows(await api.digitallyPaidInvoices(token, tenant).catch(() => [])),
  }), [token, tenant])

  return (
    <div className="space-y-4">
      <PageHead title="Digital payments → remitted" desc="Validated digital payments (bank transfer, e-wallet) waiting for finance to confirm the money reached the company account — mark them only once the funds show, not before." />
      <Link to="/dispatch/remittances" className={link}>← Back to remittances</Link>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? <Empty /> : (
        <Card title="Awaiting remittance" desc="Tick each settled invoice and mark the batch remitted together.">
          <DigitalForm token={token} tenant={tenant} invoices={data.invoices} onDone={reload} />
        </Card>
      )}
    </div>
  )
}

function DigitalForm({ token, tenant, invoices, onDone }) {
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
    <>
      <ErrorBox error={err} />
      <Notice>{ok}</Notice>
      {paid.length === 0 ? <Empty text="No validated digital payments awaiting remittance." /> : (
        <>
          <ul className="max-h-96 space-y-1 overflow-y-auto">
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
    </>
  )
}
