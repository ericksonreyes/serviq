import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, CardContent, CircularProgress, Container,
  Rating, Stack, Step, StepLabel, Stepper, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

// Customer-facing tracking: received → assigned → en route → started →
// completed, driven by the read-model job status the BFF joins in.
const STEPS = ['Request received', 'Technician assigned', 'Technician en route', 'Service started', 'Completed']
const PHASE = {
  submitted: 0, requested: 0, confirmed: 0, finding_agent: 0,
  assigned: 1, en_route: 2, in_progress: 3, completed: 4,
}

export default function RequestDetail() {
  const { token } = useAuth()
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [services, setServices] = useState({})
  const [addresses, setAddresses] = useState({})
  const [error, setError] = useState(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    Promise.all([
      api.requestDetail(token, id),
      api.catalog(token).catch(() => ({ data: [] })),
      api.addresses(token).catch(() => ({ data: [] })),
    ])
      .then(([req, svc, addr]) => {
        setData(req.data)
        setServices(Object.fromEntries((svc.data || []).map((s) => [s.id, s.name])))
        setAddresses(Object.fromEntries((addr.data || []).map((a) => [a.id, a])))
      })
      .catch((err) => setError(err.message))
  }

  useEffect(load, [token, id])

  if (error) {
    return <Container sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>
  }
  if (!data) {
    return <Container sx={{ mt: 4 }}><CircularProgress /></Container>
  }

  const job = data.job
  const cancelled = data.status === 'cancelled' || job?.status === 'cancelled'
  const phase = job ? (PHASE[job.status] ?? 0) : (data.status === 'submitted' ? 0 : 1)
  const addr = data.address_id ? addresses[data.address_id]?.address : data.details?.address
  const canFeedback = job?.status === 'completed' && !data.feedback
  const canCancel = data.status === 'submitted' || ['requested', 'confirmed'].includes(job?.status)

  const sendFeedback = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.submitFeedback(token, id, { rating, comment })
      setFeedbackMsg('Thanks for your feedback!')
      load()
    } catch (err) {
      setFeedbackMsg(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      await api.cancelRequest(token, id)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5">{services[data.service_id] || 'Service request'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Request {data.id?.slice(0, 8)} · submitted {new Date(data.created_at || data.occurred_at).toLocaleString()}
      </Typography>

      {cancelled ? (
        <Alert severity="warning" sx={{ mb: 3 }}>This request was cancelled.</Alert>
      ) : (
        <Stepper activeStep={phase} alternativeLabel sx={{ mb: 3 }}>
          {STEPS.map((label, i) => (
            <Step key={label} completed={phase > i || phase === 4}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Details</Typography>
          {data.preferred_date && (
            <Typography variant="body2">Preferred date: {data.preferred_date}</Typography>
          )}
          {data.scheduled_for && (
            <Typography variant="body2">
              Scheduled: {new Date(data.scheduled_for).toLocaleString()}
            </Typography>
          )}
          {addr && (
            <Typography variant="body2">
              Address: {[addr.line1, addr.barangay, addr.city].filter(Boolean).join(', ')}
            </Typography>
          )}
          {data.details?.notes && (
            <Typography variant="body2">Notes: {data.details.notes}</Typography>
          )}
          {job?.agent_id && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              A technician is assigned to this job.
            </Typography>
          )}
          {canCancel && (
            <Button color="error" onClick={cancel} disabled={busy} sx={{ mt: 1 }}>
              Cancel request
            </Button>
          )}
        </CardContent>
      </Card>

      {data.feedback && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Your review</Typography>
            <Rating value={data.feedback.rating} readOnly />
            {data.feedback.comment && (
              <Typography variant="body2" sx={{ mt: 1 }}>{data.feedback.comment}</Typography>
            )}
          </CardContent>
        </Card>
      )}

      {canFeedback && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>How was the service?</Typography>
            <Stack component="form" spacing={2} onSubmit={sendFeedback}>
              {feedbackMsg && <Alert severity="info">{feedbackMsg}</Alert>}
              <Rating value={rating} onChange={(_e, v) => setRating(v || 1)} />
              <TextField
                label="Comment (optional)" multiline minRows={2}
                value={comment} onChange={(e) => setComment(e.target.value)}
              />
              <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: 'flex-start' }}>
                Submit review
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Button component={Link} to="/" variant="text">Back home</Button>
    </Container>
  )
}
