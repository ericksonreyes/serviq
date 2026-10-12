import { useState } from 'react'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, StatusBadge, fmtDate, link, linkDanger, money, selectCompact } from '../../components/ui'

// Payment evidence review — parsed receipts and deposit slips. Flagged
// records (low confidence, duplicate references) need a human decision.
export default function Evidence() {
  const { token } = useAuth()
  const tenant = useTenant()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoader(
    async () => api.paymentEvidence(token, tenant, status ? `?status=${status}` : '', page), [token, tenant, status, page],
  )
  const list = rows(data)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHead title="Payment evidence" desc="Receipts and slips — what was claimed vs. what the AI read." />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className={selectCompact}>
          <option value="">all statuses</option>
          <option value="flagged">flagged</option>
          <option value="accepted">accepted</option>
          <option value="rejected">rejected</option>
        </select>
      </div>
      <ErrorBox error={error} />
      <Card title="Evidence records">
        <Pager meta={data} onPage={setPage} top />
        {loading ? <Loading /> : list.length === 0 ? <Empty /> : (
          <>
          <div className="hidden sm:block overflow-x-auto"><table className="w-full">
            <thead><tr className="border-b border-slate-200"><Th>Type</Th><Th>Reference</Th><Th>Amount</Th><Th>Confidence</Th><Th>Flags</Th><Th>Status</Th><Th>Received</Th><Th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((e) => <Row key={e.id} e={e} token={token} tenant={tenant} onDone={reload} />)}
            </tbody>
          </table></div>
          <div className="sm:hidden divide-y divide-slate-100">
            {list.map((e) => <RowCard key={e.id} e={e} token={token} tenant={tenant} onDone={reload} />)}
          </div>
          </>
        )}
        <Pager meta={data} onPage={setPage} />
      </Card>
    </div>
  )
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
const Td = ({ children, className = '' }) => <td className={`px-3 py-2 text-sm text-slate-700 ${className}`}>{children}</td>

// Shared row state — the desktop <tr> and the mobile card render the same
// expandable review panel.
function useReviewState(e, token, tenant, onDone) {
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

  return { open, setOpen, notes, setNotes, busy, err, review }
}

function ReviewPanel({ e, s }) {
  return (
    <>
      {s.err && <p className="mb-2 text-sm text-red-600">{s.err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <input className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="Review note — what did you verify?" value={s.notes} onChange={(x) => s.setNotes(x.target.value)} />
        <button onClick={() => s.review('accept')} disabled={s.busy} className={link}>Accept — record payment</button>
        <button onClick={() => s.review('reject')} disabled={s.busy} className={linkDanger}>Reject</button>
      </div>
      {e.raw_text && <pre className="mt-2 max-h-32 overflow-y-auto rounded bg-white p-2 text-xs text-slate-500">{e.raw_text}</pre>}
    </>
  )
}

function Row({ e, token, tenant, onDone }) {
  const s = useReviewState(e, token, tenant, onDone)
  const flagged = e.status === 'flagged' || (e.flags || []).length > 0

  return (
    <>
      <tr className={e.duplicate_reference ? 'bg-red-50' : flagged ? 'bg-amber-50' : ''}>
        <Td>{(e.document_type || '').replace(/_/g, ' ')}</Td>
        <Td>
          <span className="font-mono text-xs">{e.extracted?.reference || '—'}</span>
          {e.duplicate_reference && (
            <span className="ml-2 rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-semibold text-white">duplicate reference</span>
          )}
        </Td>
        <Td>{money(e.extracted?.amount_cents)}</Td>
        <Td>{e.confidence != null ? `${Math.round(e.confidence * 100)}%` : '—'}</Td>
        <Td>{(e.flags || []).length ? <span className="text-sm text-red-600">{e.flags.join(', ')}</span> : '—'}</Td>
        <Td><StatusBadge value={e.status} /></Td>
        <Td>{fmtDate(e.created_at)}</Td>
        <Td>
          {e.status === 'flagged' && (
            <button onClick={() => s.setOpen(!s.open)} className={link}>
              {s.open ? 'Close' : 'Review'}
            </button>
          )}
        </Td>
      </tr>
      {s.open && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-3 py-3">
            <ReviewPanel e={e} s={s} />
          </td>
        </tr>
      )}
    </>
  )
}

function RowCard({ e, token, tenant, onDone }) {
  const s = useReviewState(e, token, tenant, onDone)
  const flagged = e.status === 'flagged' || (e.flags || []).length > 0

  return (
    <div className={`space-y-1.5 px-2 py-3 ${e.duplicate_reference ? 'bg-red-50' : flagged ? 'bg-amber-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{(e.document_type || '').replace(/_/g, ' ')}</span>
        <StatusBadge value={e.status} />
      </div>
      <div className="text-sm">
        <span className="font-mono text-xs">{e.extracted?.reference || '—'}</span>
        {e.duplicate_reference && (
          <span className="ml-2 rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-semibold text-white">duplicate reference</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
        <span className="font-medium">{money(e.extracted?.amount_cents)}</span>
        <span>{e.confidence != null ? `${Math.round(e.confidence * 100)}%` : '—'} conf.</span>
        <span className="text-xs text-slate-500">{fmtDate(e.created_at)}</span>
      </div>
      {(e.flags || []).length > 0 && <div className="text-sm text-red-600">{e.flags.join(', ')}</div>}
      {e.status === 'flagged' && (
        <div className="pt-1">
          <button onClick={() => s.setOpen(!s.open)} className={link}>
            {s.open ? 'Close review' : 'Review'}
          </button>
        </div>
      )}
      {s.open && (
        <div className="rounded-lg bg-slate-50 p-3">
          <ReviewPanel e={e} s={s} />
        </div>
      )}
    </div>
  )
}
