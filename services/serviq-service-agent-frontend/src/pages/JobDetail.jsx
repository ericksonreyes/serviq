import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import Shell from '../Shell'
import { addressText, money, navigateUrl, STATUS_COLORS, STATUS_LABELS } from '../format'

const DOC_TYPES = [
  ['E_WALLET', 'E-wallet receipt (GCash, Maya, …)'],
  ['POS_RECEIPT', 'Card / POS receipt'],
  ['BANK_SLIP', 'Bank deposit slip'],
  ['BANK_CHECK', 'Check'],
]

const fileToB64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result.split(',')[1])
  r.onerror = reject
  r.readAsDataURL(file)
})

function Section({ title, children }) {
  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        {children}
      </CardContent>
    </Card>
  )
}

function EvidenceSummary({ row }) {
  const when = row.created_at ? new Date(row.created_at).toLocaleString() : ''
  let text = row.kind
  if (row.kind === 'note') text = `Note — ${row.data?.text ?? ''}`
  if (row.kind === 'part') {
    text = `Part — ${row.data?.name ?? ''} ×${row.data?.qty ?? 1} (${money(row.data?.cost_cents)})`
  }
  if (row.kind === 'photo') text = `Photo — ${row.object_ref?.split('/').pop() ?? 'uploaded'}`
  if (row.kind === 'signature') text = `Customer confirmation — ${row.data?.name ?? 'captured'}`
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1}>
      <Typography variant="body2">{text}</Typography>
      <Typography variant="caption" color="text.secondary">{when}</Typography>
    </Stack>
  )
}

export default function JobDetail() {
  const { id } = useParams()
  const { token } = useAuth()
  const [job, setJob] = useState(null)
  const [evidence, setEvidence] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [note, setNote] = useState('')
  const [part, setPart] = useState({ name: '', qty: 1, cost: '' })
  const [confirmName, setConfirmName] = useState('')
  const [payment, setPayment] = useState({ document_type: 'E_WALLET', reference: '', amount: '', channel: '' })
  const [confirmDone, setConfirmDone] = useState(false)
  const photoInput = useRef(null)
  const receiptInput = useRef(null)

  const load = useCallback(async () => {
    try {
      const [j, ev] = await Promise.all([api.myJob(token, id), api.listEvidence(token, id)])
      setJob(j.data)
      setEvidence(ev.data ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => { load() }, [load])

  const act = async (fn) => {
    setBusy(true); setError(null); setNotice(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const addNote = () => act(async () => {
    await api.postEvidence(token, id, { kind: 'note', data: { text: note } })
    setNote('')
    setNotice('Note saved.')
  })

  const addPart = () => act(async () => {
    await api.postEvidence(token, id, {
      kind: 'part',
      data: {
        name: part.name,
        qty: Number(part.qty) || 1,
        cost_cents: Math.round(parseFloat(part.cost || '0') * 100),
      },
    })
    setPart({ name: '', qty: 1, cost: '' })
    setNotice('Part recorded.')
  })

  const uploadPhoto = (file) => act(async () => {
    await api.uploadEvidenceFile(token, id, { file, kind: 'photo' })
    setNotice('Photo uploaded.')
  })

  const captureConfirmation = () => act(async () => {
    await api.postEvidence(token, id, {
      kind: 'signature',
      data: { name: confirmName, method: 'typed-name', confirmed_at: new Date().toISOString() },
    })
    setConfirmName('')
    setNotice('Customer confirmation captured.')
  })

  const submitPayment = (file) => act(async () => {
    let fileRef = null
    if (file) {
      const up = await api.uploadEvidenceFile(token, id, { file, kind: 'photo' })
      fileRef = up.data?.object_ref ?? null
    }
    if (!fileRef) throw new Error('Attach the customer’s receipt photo first')
    // Claimed fields are what the agent typed; the AI parses the same
    // photo upstream and Billing compares them (claimed_mismatch → review).
    const res = await api.submitPaymentEvidence(token, {
      document_type: payment.document_type,
      file_ref: fileRef,
      file_b64: await fileToB64(file),
      filename: file.name,
      claimed: {
        reference: payment.reference,
        amount_cents: Math.round(parseFloat(payment.amount || '0') * 100),
      },
    })
    const status = res.data?.status
    setNotice(status === 'accepted'
      ? 'Payment evidence recorded.'
      : `Payment evidence sent for review (${status || 'pending'}).`)
  })

  if (loading) return <Shell title="Job"><CircularProgress sx={{ mt: 4 }} /></Shell>
  if (!job) return <Shell title="Job"><Alert severity="error" sx={{ mt: 2 }}>{error || 'Job not found'}</Alert></Shell>

  const steps = job.workflow_instance ?? []
  const allClosed = steps.length > 0 && steps.every((s) => s.state === 'closed')
  const nav = navigateUrl(job.address)
  const inProgress = job.status === 'in_progress'

  return (
    <Shell title="Job detail">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip color={STATUS_COLORS[job.status] || 'default'}
          label={STATUS_LABELS[job.status] || job.status} />
        {job.job_status && job.job_status !== job.status && (
          <Chip variant="outlined" size="small" label={`Job: ${job.job_status}`} />
        )}
      </Stack>
      <Typography variant="h5">{job.customer?.name || 'Customer'}</Typography>
      <Typography variant="body2" color="text.secondary">
        {addressText(job.address) || 'Address on request'}
      </Typography>
      {job.scheduled_for && (
        <Typography variant="body2" color="text.secondary">Scheduled: {job.scheduled_for}</Typography>
      )}
      {job.notes && (
        <Alert severity="info" sx={{ mt: 1 }}>{job.notes}</Alert>
      )}

      {nav && (
        <Button variant="outlined" fullWidth sx={{ mt: 2 }} href={nav} target="_blank" rel="noreferrer">
          Navigate to customer
        </Button>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}

      <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
        {job.status === 'assigned' && (
          <Button variant="contained" size="large" fullWidth disabled={busy}
            onClick={() => act(() => api.checkIn(token, id))}>
            Check in on site
          </Button>
        )}
        {inProgress && (
          <Button variant="contained" color="success" size="large" fullWidth disabled={busy}
            onClick={() => setConfirmDone(true)}>
            Complete job
          </Button>
        )}
      </Stack>

      {steps.length > 0 && (
        <Section title="Work steps">
          <Stack spacing={1}>
            {steps.map((s, i) => (
              <Stack key={i} direction="row" alignItems="center" spacing={1}>
                <Chip size="small" color={STATUS_COLORS[s.state] || 'default'}
                  label={STATUS_LABELS[s.state] || s.state} />
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{s.name}</Typography>
                {s.state === 'open' && (
                  <Button size="small" disabled={!inProgress || busy}
                    onClick={() => act(() => api.stepAction(token, id, i, 'start'))}>Start</Button>
                )}
                {s.state === 'in-progress' && (
                  <Button size="small" variant="outlined" disabled={busy}
                    onClick={() => act(() => api.stepAction(token, id, i, 'close'))}>Close</Button>
                )}
              </Stack>
            ))}
          </Stack>
        </Section>
      )}

      <Section title="Field notes">
        <Stack spacing={1.5}>
          <TextField label="Add a note" multiline minRows={2} value={note}
            onChange={(e) => setNote(e.target.value)} />
          <Button variant="outlined" disabled={busy || !note.trim()} onClick={addNote}>
            Save note
          </Button>
        </Stack>
      </Section>

      <Section title="Photos">
        <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = '' }} />
        <Button variant="outlined" disabled={busy} onClick={() => photoInput.current?.click()}>
          Take / upload photo
        </Button>
      </Section>

      <Section title="Parts & materials">
        <Stack spacing={1.5}>
          <TextField label="Part or material" value={part.name}
            onChange={(e) => setPart({ ...part, name: e.target.value })} />
          <Stack direction="row" spacing={1.5}>
            <TextField label="Qty" type="number" value={part.qty} inputProps={{ min: 1 }}
              onChange={(e) => setPart({ ...part, qty: e.target.value })} sx={{ width: 100 }} />
            <TextField label="Cost (₱)" type="number" value={part.cost} inputProps={{ min: 0, step: '0.01' }}
              onChange={(e) => setPart({ ...part, cost: e.target.value })} sx={{ flexGrow: 1 }} />
          </Stack>
          <Button variant="outlined" disabled={busy || !part.name.trim()} onClick={addPart}>
            Record part
          </Button>
        </Stack>
      </Section>

      <Section title="Proof of digital payment">
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Customer paid digitally? Photograph the receipt so Billing can match it.
        </Typography>
        <Stack spacing={1.5}>
          <TextField select label="Payment type" value={payment.document_type}
            onChange={(e) => setPayment({ ...payment, document_type: e.target.value })}>
            {DOC_TYPES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField label="Reference number" value={payment.reference}
            onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
          <Stack direction="row" spacing={1.5}>
            <TextField label="Amount (₱)" type="number" value={payment.amount}
              inputProps={{ min: 0, step: '0.01' }}
              onChange={(e) => setPayment({ ...payment, amount: e.target.value })} sx={{ flexGrow: 1 }} />
            <TextField label="Channel" placeholder="GCash" value={payment.channel}
              onChange={(e) => setPayment({ ...payment, channel: e.target.value })} sx={{ width: 130 }} />
          </Stack>
          <input ref={receiptInput} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) submitPayment(f); e.target.value = '' }} />
          <Button variant="outlined"
            disabled={busy || !payment.reference.trim() || !parseFloat(payment.amount)}
            onClick={() => receiptInput.current?.click()}>
            Photograph receipt & submit
          </Button>
        </Stack>
      </Section>

      <Section title="Customer confirmation">
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Have the customer type their name to confirm the work.
        </Typography>
        <Stack spacing={1.5}>
          <TextField label="Customer name" value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)} />
          <Button variant="outlined" disabled={busy || !confirmName.trim()}
            onClick={captureConfirmation}>
            Capture confirmation
          </Button>
        </Stack>
      </Section>

      <Section title="Evidence log">
        {evidence.length === 0 && (
          <Typography variant="body2" color="text.secondary">Nothing captured yet.</Typography>
        )}
        <Stack spacing={0.5} divider={<Divider />}>
          {evidence.map((row) => <EvidenceSummary key={row.id} row={row} />)}
        </Stack>
      </Section>

      <Dialog open={confirmDone} onClose={() => setConfirmDone(false)}>
        <DialogTitle>Complete this job?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {allClosed
              ? 'All steps are done. Completing closes the job for billing.'
              : 'There are still open steps. Complete anyway?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDone(false)}>Back</Button>
          <Button variant="contained" color="success" onClick={() => {
            setConfirmDone(false)
            act(() => api.completeExecution(token, id))
          }}>Complete</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ height: 32 }} />
    </Shell>
  )
}
