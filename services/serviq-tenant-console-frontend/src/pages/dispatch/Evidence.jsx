import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, StatusBadge, btn, btnDanger, fmtDate, money } from '../../components/ui'

// Payment evidence review — parsed receipts and deposit slips. Flagged
// records (low confidence, duplicate references) need a human decision.
export default function Evidence() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [status, setStatus] = useState('')
  const { data: list, error, loading, reload } = useLoader(
    async () => rows(await api.paymentEvidence(token, tenant, status ? `?status=${status}` : '')), [token, tenant, status],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Payment evidence</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">all statuses</option>
          <option value="flagged">flagged</option>
          <option value="accepted">accepted</option>
          <option value="rejected">rejected</option>
        </select>
      </div>
      <ErrorBox error={error} />
      <Card title="Evidence records">
        {loading ? <Loading /> : !list || list.length === 0 ? <Empty /> : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-200"><Th>Type</Th><Th>Reference</Th><Th>Amount</Th><Th>Confidence</Th><Th>Flags</Th><Th>Status</Th><Th>Received</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((e) => <Row key={e.id} e={e} token={token} tenant={tenant} onDone={reload} />)}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
const Td = ({ children, className = '' }) => <td className={`px-3 py-2 text-sm text-slate-700 ${className}`}>{children}</td>

function Row({ e, token, tenant, onDone }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const review = async (decision) => {
    setBusy(true)
    setErr(null)
    try {
      await api.reviewEvidence(token, tenant, e.id, { decision, notes: notes || undefined })
      setOpen(false)
      onDone()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  const flagged = e.status === 'flagged' || (e.flags || []).length > 0

  return (
    <>
      <tr className={e.duplicate_reference ? 'bg-red-50' : flagged ? 'bg-amber-50' : ''}>
        <Td>{(e.document_type || '').replace(/_/g, ' ')}</Td>
        <Td>
          <span className="font-mono text-xs">{e.extracted?.reference || '—'}</span>
          {e.duplicate_reference && (
            <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">duplicate reference</span>
          )}
        </Td>
        <Td>{money(e.extracted?.amount_cents)}</Td>
        <Td>{e.confidence != null ? `${Math.round(e.confidence * 100)}%` : '—'}</Td>
        <Td>{(e.flags || []).length ? <span className="text-xs text-red-600">{e.flags.join(', ')}</span> : '—'}</Td>
        <Td><StatusBadge value={e.status} /></Td>
        <Td>{fmtDate(e.created_at)}</Td>
        <Td>
          {e.status === 'flagged' && (
            <button onClick={() => setOpen(!open)} className="text-sm font-medium text-teal-700 hover:underline">
              {open ? 'Close' : 'Review'}
            </button>
          )}
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-3 py-3">
            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <input className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Review note — what did you verify?" value={notes} onChange={(x) => setNotes(x.target.value)} />
              <button onClick={() => review('accept')} disabled={busy} className={btn}>Accept — record payment</button>
              <button onClick={() => review('reject')} disabled={busy} className={btnDanger}>Reject</button>
            </div>
            {e.raw_text && <pre className="mt-2 max-h-32 overflow-y-auto rounded bg-white p-2 text-xs text-slate-500">{e.raw_text}</pre>}
          </td>
        </tr>
      )}
    </>
  )
}
