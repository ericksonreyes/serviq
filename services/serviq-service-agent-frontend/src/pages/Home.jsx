import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Button, Card, CardActions, CardContent, Chip, CircularProgress,
  Divider, Stack, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import Shell from '../Shell'
import { addressText, fmtDateTime, STATUS_COLORS, STATUS_LABELS } from '../format'

function OfferCard({ offer, onDecide, busy }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1">{offer.customer?.name || 'New assignment offer'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {addressText(offer.address) || 'Address provided after accepting'}
        </Typography>
        {offer.scheduled_for && (
          <Typography variant="body2" color="text.secondary">Scheduled: {fmtDateTime(offer.scheduled_for)}</Typography>
        )}
        {offer.expires_at && (
          <Typography variant="caption" color="text.secondary">
            Offer expires {fmtDateTime(offer.expires_at)}
          </Typography>
        )}
      </CardContent>
      <CardActions>
        <Button variant="contained" disabled={busy} onClick={() => onDecide(offer.id, 'accept')}>Accept</Button>
        <Button variant="outlined" color="inherit" disabled={busy} onClick={() => onDecide(offer.id, 'reject')}>Decline</Button>
      </CardActions>
    </Card>
  )
}

function PoolCard({ job, onClaim, busy }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1">{job.customer?.name || `Job ${job.job_id?.slice(0, 8)}…`}</Typography>
        <Typography variant="body2" color="text.secondary">
          {addressText(job.address) || 'Address on request'}
        </Typography>
        {job.scheduled_for && (
          <Typography variant="body2" color="text.secondary">Scheduled: {fmtDateTime(job.scheduled_for)}</Typography>
        )}
      </CardContent>
      <CardActions>
        <Button variant="contained" disabled={busy} onClick={() => onClaim(job.job_id)}>Claim job</Button>
      </CardActions>
    </Card>
  )
}

export default function Home() {
  const { token, claims } = useAuth()
  const [home, setHome] = useState(null)
  const [jobs, setJobs] = useState([])
  const [pool, setPool] = useState({ data: [], strategy: null })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.agentHome(token, claims.sub).then((res) => setHome(res.data ?? res)),
      api.myJobs(token).then((res) => setJobs(res.data ?? [])),
      api.openJobs(token).then((res) => setPool({ data: res.data ?? [], strategy: res.strategy })),
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token, claims])

  useEffect(() => { load() }, [load])

  const decide = async (assignmentId, action) => {
    setBusy(true)
    setError(null)
    try {
      if (action === 'accept') await api.acceptAssignment(token, assignmentId)
      else await api.rejectAssignment(token, assignmentId)
      load()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    } finally {
      setBusy(false)
    }
  }

  const claim = async (jobId) => {
    setBusy(true)
    setError(null)
    try {
      await api.claimJob(token, jobId)
      load()
    } catch (err) {
      // 404 = another agent claimed it first — reload shows the fresh pool.
      setError(err.status === 404 ? 'That job was just claimed by another agent.' : err.message)
      load()
    } finally {
      setBusy(false)
    }
  }

  const agent = home?.agent?.data ?? home?.agent
  const offers = home?.offers ?? []
  const active = jobs.filter((e) => !['completed', 'cancelled'].includes(e.status))

  return (
    <Shell>
      <Typography variant="h5">Hi{agent?.name ? `, ${agent.name}` : ''}</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Here's your day.
      </Typography>

      {loading && <CircularProgress sx={{ mt: 4 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {!loading && home && (
        <>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Assignment offers</Typography>
          {offers.length === 0 && (
            <Typography color="text.secondary">No open offers right now.</Typography>
          )}
          <Stack spacing={1.5}>
            {offers.map((o) => <OfferCard key={o.id} offer={o} onDecide={decide} busy={busy} />)}
          </Stack>

          {pool.strategy === 'self' && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>Open jobs</Typography>
              {pool.data.length === 0 && (
                <Typography color="text.secondary">Nothing in the pool right now — new jobs appear here as they open up.</Typography>
              )}
              <Stack spacing={1.5}>
                {pool.data.map((j) => <PoolCard key={j.job_id} job={j} onClaim={claim} busy={busy} />)}
              </Stack>
            </>
          )}

          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>Active jobs</Typography>
          {active.length === 0 && (
            <Typography color="text.secondary">
              No assignments yet — new work shows up here when a dispatcher assigns you.
            </Typography>
          )}
          <Stack spacing={1.5}>
            {active.slice(0, 5).map((e) => (
              <Card key={e.execution_id} component={RouterLink} to={`/jobs/${e.execution_id}`}
                sx={{ textDecoration: 'none', display: 'block' }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Chip size="small" color={STATUS_COLORS[e.status] || 'default'}
                      label={STATUS_LABELS[e.status] || e.status} />
                    {e.scheduled_for && (
                      <Typography variant="caption" color="text.secondary">{fmtDateTime(e.scheduled_for)}</Typography>
                    )}
                  </Stack>
                  <Typography variant="subtitle1">
                    {e.customer?.name || `Job ${e.job_id?.slice(0, 8)}…`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {addressText(e.address) || 'Address on request'}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>
          <Button component={RouterLink} to="/jobs" sx={{ mt: 2 }}>All jobs</Button>
        </>
      )}
    </Shell>
  )
}
