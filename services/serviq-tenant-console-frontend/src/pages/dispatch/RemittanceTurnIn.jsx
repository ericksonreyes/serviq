import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, rows } from '../../api'
import { useAuth, useTenant } from '../../auth'
import { useLoader } from '../../hooks'
import { Card, Empty, ErrorBox, Loading, Notice, PageHead, ThinkingLabel, btn, input, label, link, money, select } from '../../components/ui'

// The AI emits one row per visible item with loose key names —
// {"denomination": "₱20"} or {"value": 1000, "count": 5}. Merge into
// face-value totals so the breakdown reads like a count sheet, not a
// raw model dump.
const fileToB64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
  reader.onerror = reject
  reader.readAsDataURL(file)
})

// External-transfer rails (ADR-0026/0027): the agent settles through an
// outside rail and hands the dispatcher its receipt — the rail decides which
// evidence document proves it and where the dispatcher verifies arrival.
const RAILS = {
  wallet: {
    doc: 'E_WALLET', aiDoc: 'e_wallet_receipt',
    label: 'E-wallet transfer', noun: 'e-wallet receipt (GCash/Maya)',
    verifyAt: 'the company wallet', channelLabel: 'e-wallet',
  },
  bank: {
    doc: 'BANK_SLIP', aiDoc: 'bank_deposit_slip',
    label: 'Bank deposit', noun: 'bank deposit slip',
    verifyAt: 'the company bank account', channelLabel: 'bank deposit',
  },
  remittance_center: {
    doc: 'REMITTANCE_RECEIPT', aiDoc: 'remittance_receipt',
    label: 'Remittance center', noun: 'remittance-center receipt (Palawan/Cebuana)',
    verifyAt: 'the remittance-center payout', channelLabel: 'remittance center',
  },
}

function DenominationBreakdown({ rows }) {
  const faceOf = (d) => {
    const raw = d.denomination ?? d.value ?? d.amount ?? d.face_value ?? d.bill ?? d.note ?? d.coin
    const m = String(raw ?? '').replace(/,/g, '').match(/[\d.]+/)
    return m ? Number(m[0]) : null
  }
  const countOf = (d) => {
    const raw = d.count ?? d.quantity ?? d.qty ?? d.pieces ?? d.pcs ?? d.number
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 1
  }
  const merged = new Map()
  for (const d of rows ?? []) {
    const face = faceOf(d)
    if (face != null) merged.set(face, (merged.get(face) ?? 0) + countOf(d))
  }
  const list = [...merged.entries()].sort((a, b) => b[0] - a[0])
  if (!list.length) return null
  const total = list.reduce((s, [face, n]) => s + face * n, 0)
  return (
    <div className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2">
      <ul className="space-y-0.5 text-xs text-slate-600">
        {list.map(([face, n]) => (
          <li key={face} className="flex justify-between">
            <span>{money(Math.round(face * 100))} × {n}</span>
            <span className="text-slate-400">{money(Math.round(face * n * 100))}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-xs font-medium text-slate-700">
        <span>AI total</span>
        <span>{money(Math.round(total * 100))}</span>
      </p>
    </div>
  )
}

// Turn-in — one money task per page (see Remittances index). Channels:
// cash hand-over (counted total) or an external transfer — e-wallet, bank
// deposit, remittance center (ADR-0026/0027 — the receipt settles all
// agent-held collections).
export default function RemittanceTurnIn() {
  const { token } = useAuth()
  const tenant = useTenant()
  const { data, error, loading } = useLoader(async () => ({
    agents: rows(await api.agents(token, tenant).catch(() => [])),
    evidence: rows(await api.paymentEvidence(token, tenant).catch(() => [])),
    accounts: rows(await api.companyAccounts(token, tenant).catch(() => [])),
  }), [token, tenant])

  return (
    <div className="space-y-4">
      <PageHead title="Agent turn-in" desc="Log an agent's shift-end settlement — physical cash or a transfer receipt — a mismatch goes to manual review instead of failing." />
      <Link to="/dispatch/remittances" className={link}>← Back to remittances</Link>
      <ErrorBox error={error} />
      {loading ? <Loading /> : !data ? <Empty /> : (
        <Card title="Submit a turn-in" desc="Pick the agent to see what they owe, then choose how they're settling — physical cash (AI count or manual total) or a transfer receipt (e-wallet, bank deposit, remittance center). Either way the turn-in lands in records for confirmation.">
          <TurnInForm token={token} tenant={tenant} agents={data.agents} evidence={data.evidence} accounts={data.accounts} />
        </Card>
      )}
    </div>
  )
}

function TurnInForm({ token, tenant, agents, evidence, accounts }) {
  const [searchParams] = useSearchParams()
  const [agentId, setAgentId] = useState('')
  const initial = searchParams.get('channel')
  const [channel, setChannel] = useState(RAILS[initial] ? initial : 'cash')
  const [evidenceId, setEvidenceId] = useState('')
  const [expected, setExpected] = useState(null)
  const [counted, setCounted] = useState('')
  const [photo, setPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [aiDenominations, setAiDenominations] = useState(null)
  const [counting, setCounting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const rail = RAILS[channel] // null for cash
  const transferReceipts = (evidence ?? []).filter((e) =>
    e.status !== 'rejected' && rail && e.document_type === rail.doc)
  const [receipt, setReceipt] = useState(null)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [receiptPreviewFailed, setReceiptPreviewFailed] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [claimedRef, setClaimedRef] = useState('')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [claimedRecipient, setClaimedRecipient] = useState('')

  // Bounded preview for the selected receipt — same object-URL pattern
  // as the cash photo; revoked on change/unmount.
  useEffect(() => {
    setReceiptPreviewFailed(false)
    if (!receipt) { setReceiptUrl(null); return undefined }
    const url = URL.createObjectURL(receipt)
    setReceiptUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [receipt])

  // Parse on select — the AI-read fields land in the inputs so the
  // dispatcher verifies them against the preview before submitting.
  const pickReceipt = async (file) => {
    setReceipt(file)
    setParsed(null)
    setErr(null)
    setClaimedRef('')
    setClaimedAmount('')
    setClaimedRecipient('')
    if (!file) return
    setParsing(true)
    try {
      const p = await api.parseDoc(token, file)
      setParsed(p)
      const f = p?.fields ?? {}
      if (f.reference_no) setClaimedRef(String(f.reference_no))
      const amt = f.amount_cents != null
        ? Number(f.amount_cents) / 100
        : Number(String(f.amount ?? '').replace(/,/g, ''))
      if (Number.isFinite(amt) && amt > 0) setClaimedAmount(amt.toFixed(2))
      const recip = f.recipient_account ?? f.recipient_name
      if (recip) setClaimedRecipient(String(recip))
      if (p?.document_type && rail && p.document_type !== rail.aiDoc) {
        setErr(`That photo looks like a ${p.document_type.replace(/_/g, ' ')}, not a ${rail.noun} — check the parsed values.`)
      }
    } catch {
      setErr('Could not parse the receipt — enter the reference and amount manually.')
    } finally {
      setParsing(false)
    }
  }

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
      let evId = evidenceId
      // Fresh receipt photo → persist it as transfer evidence (extracted =
      // what the AI read on select, claimed = the dispatcher's verified
      // values — a correction flags claimed_mismatch), then turn it in.
      if (rail && receipt) {
        const f = parsed?.fields ?? {}
        const toCents = (v) => v == null || v === '' ? null : Math.round(Number(v) * 100)
        const ev = await api.createEvidence(token, tenant, {
          document_type: rail.doc,
          file_b64: await fileToB64(receipt),
          filename: receipt.name,
          extracted: {
            reference: f.reference_no ?? (claimedRef || null),
            amount_cents: toCents(f.amount) ?? toCents(claimedAmount) ?? 0,
            channel: f.provider ?? f.bank ?? null,
            payer_name: f.sender ?? null,
            recipient_name: f.recipient_name ?? null,
            recipient_account: f.recipient_account ?? null,
            paid_at: f.date ?? f.deposit_date ?? null,
          },
          claimed: { reference: claimedRef || null, amount_cents: toCents(claimedAmount), recipient: claimedRecipient || null },
          confidence: parsed?.confidence ?? null,
          raw_text: parsed ? JSON.stringify(f) : null,
        })
        evId = ev.data.id
      }
      await api.submitTurnIn(token, tenant, rail
        ? { agent_id: agentId, channel, evidence_id: evId }
        : { agent_id: agentId, counted_total_cents: Math.round(Number(counted) * 100) })
      setOk(rail
        ? `${rail.label} turn-in submitted — it stays in manual review until the transfer is verified as arrived.`
        : 'Turn-in submitted for confirmation.')
      setCounted('')
      setEvidenceId('')
      setReceipt(null)
      setParsed(null)
      setClaimedRef('')
      setClaimedAmount('')
      setClaimedRecipient('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Photo count — the AI parses denominations off the image and fills the
  // counted field for the dispatcher to eyeball; submitting stays a human
  // action through the button below.
  const countPhoto = async () => {
    setCounting(true)
    setErr(null)
    setOk(null)
    try {
      const res = await api.chatUpload(token, 'dispatcher', 'count this cash turn-in', { tenant_id: tenant, agent_id: agentId }, photo)
      // A populated tool_calls means the count ran; the chat endpoint
      // returns 200 with an apology reply on tool failure, so absence of
      // tool_calls is the honest failure signal.
      const data = res.tool_calls?.[0]?.data
      if (res.tool_calls?.length && data?.counted_total_cents > 0) {
        setCounted((data.counted_total_cents / 100).toFixed(2))
        setAiDenominations(Array.isArray(data.denominations) ? data.denominations : null)
        setOk(`AI counted ${money(data.counted_total_cents)} — check it against the cash, then submit.`)
      } else {
        setErr(res.reply || 'The photo count failed — try again or enter the total manually.')
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setCounting(false)
    }
  }

  // Object URL for the bounded preview — revoked when the pick changes
  // or the form unmounts. `previewFailed` covers formats the browser
  // can't decode (e.g. HEIC outside Safari) — hide, don't break.
  const [previewFailed, setPreviewFailed] = useState(false)
  useEffect(() => {
    setPreviewFailed(false)
    if (!photo) { setPreviewUrl(null); return undefined }
    const url = URL.createObjectURL(photo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const cashExpected = expected?.expected_cents ?? expected?.total_cents
  const heldExpected = expected?.held_expected_cents ?? expected?.wallet_expected_cents
  const expectedTotal = rail ? heldExpected : cashExpected
  const items = rail
    ? (expected?.agent_held ?? [])
    : (expected?.items ?? expected?.invoices ?? expected?.collections ?? [])

  return (
    <>
      <ErrorBox error={err} />
      <Notice>{ok}</Notice>
      <label className={label}>Agent</label>
      <select className={select} value={agentId} onChange={(e) => loadExpected(e.target.value)}>
        <option value="">Select agent…</option>
        {agents.map((a) => <option key={a.id} value={a.agent_id || a.id}>{a.name}</option>)}
      </select>
      {agentId && (
        <div className="mt-3 space-y-2">
          <label className={label}>How is the agent settling?</label>
          <select className={select} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="cash">Cash hand-over — bills counted on the counter</option>
            <option value="wallet">E-wallet transfer — GCash/Maya receipt settles everything held</option>
            <option value="bank">Bank deposit — deposit slip settles everything held</option>
            <option value="remittance_center">Remittance center — Palawan/Cebuana receipt settles everything held</option>
          </select>
          {expected && (
            <div className="rounded-lg bg-slate-50 p-2 text-sm">
              <p className="font-medium">
                Expected to turn in: {money(expectedTotal)}
                <span className="font-normal text-slate-500">
                  {rail
                    ? ` — all agent-held collections, cash + wallet-paid${items.length ? ` (${items.length} service${items.length !== 1 ? 's' : ''})` : ''}`
                    : ` — cash collected but not yet handed over${items.length ? ` (${items.length} service${items.length !== 1 ? 's' : ''})` : ''}`}
                </span>
              </p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-500">
                {items.map((i, idx) => (
                  <li key={i.id ?? idx} className="flex justify-between">
                    <span className="font-mono">{(i.invoice_id || i.id || '').slice(0, 12)}…</span>
                    <span>{money(i.amount_cents)}</span>
                  </li>
                ))}
              </ul>
              {(expected.in_flight ?? []).map((r) => (
                <p key={r.id} className="mt-1.5 text-xs text-amber-700">
                  {money(r.counted_cents)} already turned in{RAILS[r.channel] ? ` via ${RAILS[r.channel].channelLabel}` : ''} (expected {money(r.expected_cents)}
                  {r.variance_cents ? `, ${money(Math.abs(r.variance_cents))} ${r.variance_cents < 0 ? 'short' : 'over'}` : ''})
                  {' '}— a dispatcher must {r.variance_cents ? 'override, accept the shortfall, or reject' : 'confirm or reject'} it.
                  {' '}<Link to="/dispatch/remittances" className="font-medium underline">Decide it in Remittance records →</Link>
                </p>
              ))}
            </div>
          )}
          {channel === 'cash' && (
          <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-3">
            <label className={label}>Photo count (AI)</label>
            <p className="mt-1 text-xs text-slate-500">
              Photograph the laid-out bills and coins — the AI counts the denominations into the field below for you to check before submitting.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input type="file" accept="image/*" capture="environment" className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-700 hover:file:bg-violet-200" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <button onClick={countPhoto} disabled={counting || !photo} className={btn}>
                {counting ? <ThinkingLabel text="Counting" /> : 'Count & submit'}
              </button>
            </div>
            {previewUrl && !previewFailed && (
              <img src={previewUrl} alt="Cash laid out for counting"
                onError={() => setPreviewFailed(true)}
                className="mt-3 max-h-44 w-auto rounded-lg border border-violet-200 object-cover" />
            )}
          </div>
          )}
          {rail && (
            <div className="space-y-2">
              <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-3">
                <label className={label}>Transfer receipt (AI parses it)</label>
                <p className="mt-1 text-xs text-slate-500">
                  Photograph or screenshot the agent's {rail.noun} — the AI reads the
                  amount, reference, and recipient into the fields below. Check them against the preview;
                  correct if wrong — a correction flags the evidence for review.
                </p>
                {(() => {
                  const railAccounts = (accounts ?? []).filter((a) => a.channel === channel)
                  return railAccounts.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Receiving account{railAccounts.length !== 1 ? 's' : ''} on file:{' '}
                      {railAccounts.map((a) => `${a.label}${a.account_no ? ` (${a.account_no})` : ''}`).join(' · ')}
                      {' '}— a receipt naming anything else flags recipient_mismatch.
                    </p>
                  )
                })()}
                <input type="file" accept="image/*" className="mt-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-700 hover:file:bg-violet-200"
                  onChange={(e) => pickReceipt(e.target.files?.[0] ?? null)} />
                {receiptUrl && !receiptPreviewFailed && (
                  <img src={receiptUrl} alt="Transfer receipt"
                    onError={() => setReceiptPreviewFailed(true)}
                    className="mt-3 max-h-44 w-auto rounded-lg border border-violet-200 object-cover" />
                )}
                {parsing && <p className="mt-2 text-xs text-violet-600">Reading the receipt…</p>}
                {receipt && !parsing && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-500">Reference no.{parsed ? ' (AI-read)' : ''}</label>
                      <input className={input} placeholder="Reference no." value={claimedRef} onChange={(e) => setClaimedRef(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500">Amount sent (₱){parsed ? ' (AI-read)' : ''}</label>
                      <input className={input} type="number" min={0} step="0.01" placeholder="Amount sent (₱)" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-slate-500">Sent to / account{parsed ? ' (AI-read)' : ''}</label>
                      <input className={input} placeholder="Recipient name or account no." value={claimedRecipient} onChange={(e) => setClaimedRecipient(e.target.value)} />
                    </div>
                  </div>
                )}
                {parsed?.confidence != null && !parsing && (
                  <p className="mt-1 text-xs text-slate-400">Parse confidence: {Math.round(parsed.confidence * 100)}%</p>
                )}
              </div>
              <div>
                <label className={label}>…or pick an already-parsed receipt</label>
                <div className="flex items-end gap-2">
                  <select className={select} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)} disabled={!!receipt}>
                    <option value="">Select receipt…</option>
                    {transferReceipts.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.extracted?.reference || e.id.slice(0, 12)} — {money(e.extracted?.amount_cents)}
                        {e.extracted?.channel ? ` · ${e.extracted.channel}` : ''}
                      </option>
                    ))}
                  </select>
                  {evidenceId && (
                    <button
                      onClick={() => api.openEvidenceFile(token, tenant, evidenceId).catch(() => setErr('Could not open the stored receipt.'))}
                      className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50"
                    >
                      View receipt
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Receipts the agent submitted in their app, or sent through the assistant, appear here.
                </p>
              </div>
              {expected && (heldExpected ?? 0) === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  {(expected.in_flight ?? []).length > 0
                    ? 'All held collections are spoken for by the pending turn-in above — confirm or reject it first.'
                    : 'Nothing held by this agent — no turn-in owed.'}
                </p>
              )}
              <button onClick={submit} disabled={busy || (!receipt && !evidenceId) || (heldExpected ?? 0) === 0} className={`${btn} mt-2`}>
                {busy ? 'Submitting…' : `Submit ${rail.channelLabel} turn-in`}
              </button>
              <p className="mt-1 text-xs text-slate-400">
                Lands in manual review — confirm only after the transfer shows in {rail.verifyAt}.
              </p>
            </div>
          )}
          {expected && channel === 'cash' && (
            <>
              <div>
                <label className={label}>Counted total (PHP) — or enter manually</label>
                <input className={input} type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} />
                {aiDenominations && <DenominationBreakdown rows={aiDenominations} />}
                {counted && expectedTotal != null && Number(counted) * 100 !== expectedTotal && (
                  <p className="mt-1 text-sm text-amber-600">
                    Variance of {money(Math.abs(Math.round(Number(counted) * 100) - expectedTotal))} — will need dispatcher confirmation.
                  </p>
                )}
              </div>
              <button onClick={submit} disabled={busy || !counted} className={btn}>{busy ? 'Submitting…' : 'Submit turn-in'}</button>
            </>
          )}
        </div>
      )}
    </>
  )
}
