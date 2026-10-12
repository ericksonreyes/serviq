import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, CardContent, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import Shell from '../Shell'
import ThinkingDots from '../ThinkingDots'
import { money, shortId } from '../format'

export default function TurnIn() {
  const { token } = useAuth()
  const [expected, setExpected] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [counted, setCounted] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deposit, setDeposit] = useState(null)

  useEffect(() => {
    api.expectedRemittance(token)
      .then((res) => setExpected(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const collections = expected?.collections ?? []
  const expectedCents = expected?.expected_cents ?? 0
  const countedCents = Math.round(parseFloat(counted || '0') * 100)
  const variance = countedCents - expectedCents

  const submit = async () => {
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      const res = await api.turnIn(token, { counted_total_cents: countedCents })
      setResult(res.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Cash turn-in" desc="Reconcile cash collections — count what's on hand, then deposit the slip photo for Billing to verify.">
      <Typography variant="body2" color="text.secondary" gutterBottom>
        End-of-shift cash collected from cash-paid jobs. Your dispatcher confirms the count.
      </Typography>

      {loading && <CircularProgress sx={{ mt: 4 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {result && (
        <Alert severity={result.variance_cents === 0 ? 'success' : 'warning'} sx={{ mt: 2 }}>
          Turn-in submitted — {money(result.counted_cents)} counted vs {money(result.expected_cents)} expected.
          Status: {result.status}. A dispatcher will confirm.
        </Alert>
      )}

      {deposit && (
        <Alert severity={deposit.remittance?.status === 'manual_review' ? 'warning' : 'success'} sx={{ mt: 2 }}>
          Deposit submitted — {money(deposit.remittance?.counted_cents)} read from the slip vs{' '}
          {money(deposit.remittance?.expected_cents)} covered. Status: {deposit.remittance?.status}
          {deposit.remittance?.flags?.length ? ` (${deposit.remittance.flags.join(', ')})` : ''}.
          A dispatcher will confirm.
        </Alert>
      )}

      {!loading && expected && !result && !deposit && (
        <>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Expected cash-paid collections ({collections.length})
          </Typography>
          {collections.length === 0 && (
            <Typography color="text.secondary">No pending cash collections — you're all clear.</Typography>
          )}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack spacing={0.5} divider={<Divider />}>
                {collections.map((inv) => (
                  <Stack key={inv.id} direction="row" justifyContent="space-between">
                    <Typography variant="body2">Invoice {shortId(inv.id)}</Typography>
                    <Typography variant="body2">{money(inv.amount_cents)}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="subtitle1">Expected total</Typography>
                <Typography variant="subtitle1">{money(expectedCents)}</Typography>
              </Stack>
            </CardContent>
          </Card>

          {collections.length > 0 && (
            <Stack spacing={1.5}>
              <TextField
                label="Counted cash on hand (₱)"
                type="number"
                value={counted}
                inputProps={{ min: 0, step: '0.01' }}
                onChange={(e) => setCounted(e.target.value)}
              />
              {counted !== '' && variance !== 0 && (
                <Alert severity={variance < 0 ? 'warning' : 'info'}>
                  {variance < 0 ? 'Short' : 'Over'} by {money(Math.abs(variance))} — a dispatcher
                  will review the variance.
                </Alert>
              )}
              <Button variant="contained" size="large"
                disabled={busy || counted === '' || countedCents < 0}
                onClick={() => setConfirming(true)}>
                Submit turn-in
              </Button>
            </Stack>
          )}

          {collections.length > 0 && (
            <DepositForm token={token} collections={collections} onDone={setDeposit} />
          )}
        </>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Submit cash turn-in?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            You're turning in {money(countedCents)} against an expected {money(expectedCents)}
            {variance !== 0 && ` — a ${variance < 0 ? 'shortfall' : 'surplus'} of ${money(Math.abs(variance))}`}.
            This goes to your dispatcher for confirmation.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Back</Button>
          <Button variant="contained" onClick={submit}>Submit</Button>
        </DialogActions>
      </Dialog>
    </Shell>
  )
}

const fileToB64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
  reader.onerror = reject
  reader.readAsDataURL(file)
})

// Cash deposited over the counter: the slip photo is the proof. The AI Agent
// reads amount + reference; typed values are only a fallback Billing compares.
function DepositForm({ token, collections, onDone }) {
  const [type, setType] = useState('BANK_SLIP')
  const [sel, setSel] = useState(() => collections.map((c) => c.id))
  const [file, setFile] = useState(null)
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const covered = collections.filter((c) => sel.includes(c.id))
  const coveredCents = covered.reduce((sum, c) => sum + (c.amount_cents ?? 0), 0)
  const toggle = (id, on) => setSel(on ? [...sel, id] : sel.filter((x) => x !== id))

  const submit = async () => {
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      const res = await api.depositRemittance(token, {
        document_type: type,
        invoice_ids: sel,
        file_b64: await fileToB64(file),
        filename: file.name,
        claimed: {
          reference: reference || null,
          amount_cents: amount === '' ? null : Math.round(parseFloat(amount) * 100),
        },
      })
      onDone(res.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Divider sx={{ my: 3 }} />
      <Typography variant="h6" gutterBottom>Deposited at a bank or remittance center</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Upload the slip — its amount and reference are read from the photo.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      <Stack spacing={1.5}>
        <TextField select label="Proof of deposit" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
          <MenuItem value="BANK_SLIP">Bank deposit slip</MenuItem>
          <MenuItem value="REMITTANCE_RECEIPT">Remittance-center receipt</MenuItem>
        </TextField>
        <Stack>
          {collections.map((c) => (
            <FormControlLabel key={c.id}
              control={<Checkbox checked={sel.includes(c.id)} disabled={busy} onChange={(e) => toggle(c.id, e.target.checked)} />}
              label={`Invoice ${shortId(c.id)} — ${money(c.amount_cents)}`} />
          ))}
        </Stack>
        <Button variant="outlined" component="label" disabled={busy}>
          {file ? `Slip: ${file.name}` : 'Attach slip photo'}
          <input hidden type="file" accept="image/*" aria-label="Slip photo"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Button>
        <TextField label="Reference number (as printed)" value={reference} disabled={busy}
          onChange={(e) => setReference(e.target.value)}
          helperText="Only used if the photo can't be read." />
        <TextField label="Amount deposited (₱)" type="number" value={amount} disabled={busy}
          inputProps={{ min: 0, step: '0.01' }} onChange={(e) => setAmount(e.target.value)} />
        <Button variant="contained" size="large"
          disabled={busy || !file || sel.length === 0}
          onClick={() => setConfirming(true)}>
          {busy ? <ThinkingDots /> : 'Submit deposit'}
        </Button>
      </Stack>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Submit deposit?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This slip covers {covered.length} collection{covered.length === 1 ? '' : 's'} totalling{' '}
            {money(coveredCents)}. Billing checks the amount and reference on the slip, then a
            dispatcher confirms.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Back</Button>
          <Button variant="contained" onClick={submit}>Submit</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
