import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, CardContent, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import Shell from '../Shell'
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
    <Shell title="Cash turn-in">
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

      {!loading && expected && !result && (
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
