import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Grid, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import { fmtDay, fmtDateTime } from '../format'

const STATUS_LABELS = {
  submitted: 'Received', converted: 'Scheduled', cancelled: 'Cancelled',
  requested: 'Requested', confirmed: 'Confirmed', finding_agent: 'Finding a technician',
  assigned: 'Technician assigned', en_route: 'Technician en route',
  in_progress: 'Service started', completed: 'Completed',
}

const money = (cents, currency = 'PHP') =>
  cents == null ? null : `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

// The provider's bookable services, inline on Home — picking one goes
// straight to the booking form, no browse detour.
function ServiceGrid({ services }) {
  if (services.length === 0) {
    return <Typography color="text.secondary">No bookable services yet.</Typography>
  }
  return (
    <Grid container spacing={2} sx={{ mt: 0.5 }}>
      {services.map((s) => (
        <Grid item xs={12} sm={6} key={s.id}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1">{s.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40 }}>
                {s.description || 'Service visit'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
                {s.price_cents != null && (
                  <Chip size="small" label={money(s.price_cents, s.currency)} />
                )}
                {s.estimated_minutes != null && (
                  <Chip size="small" variant="outlined" label={`~${s.estimated_minutes} min`} />
                )}
              </Box>
              <Button variant="contained" component={Link} to={`/book/${s.id}`}>
                Book
              </Button>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  )
}

function ItemList({ title, items, empty, serviceNames }) {
  return (
    <>
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>{title}</Typography>
      {items.length === 0 && <Typography color="text.secondary">{empty}</Typography>}
      <Stack spacing={1.5}>
        {items.map((item, i) => (
          <Card key={item._id || item.id || i} component={Link} to={`/requests/${item._id || item.id}`}
            sx={{ textDecoration: 'none', color: 'inherit' }}>
            <CardContent>
              <Typography variant="subtitle1">
                {serviceNames[item.service_id] || item.title || 'Service request'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {STATUS_LABELS[item.status] || item.status || ''}
                {item.preferred_date ? ` · Preferred ${fmtDay(item.preferred_date)}` : ''}
                {item.scheduled_for ? ` · Scheduled ${fmtDateTime(item.scheduled_for)}` : ''}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </>
  )
}

// First sign-in path: an invited or brand-new user has no CRM customer
// record yet — collect a name once and provision it via the BFF.
function CompleteProfile({ onDone }) {
  const { token } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.createProfile(token, { name })
      onDone(res.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Typography variant="h6">Welcome! One last step</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your provider set up your account — tell us your name to finish setting up your profile.
        </Typography>
        <Stack component="form" spacing={2} onSubmit={submit}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="contained" disabled={busy || !name.trim()} sx={{ alignSelf: 'flex-start' }}>
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const { token } = useAuth()
  const [state, setState] = useState({ loading: true, profileMissing: false, error: null })
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [services, setServices] = useState([])

  const load = async () => {
    try {
      const [reqs, catalog] = await Promise.all([
        api.requests(token),
        api.catalog(token).catch(() => ({ data: [] })),
      ])
      setRequests(reqs.data || [])
      setServices((catalog.data || []).filter((s) => s.active ?? true))
      setState({ loading: false, profileMissing: false, error: null })
    } catch (err) {
      setState({ loading: false, profileMissing: false, error: err.message })
    }
  }

  useEffect(() => {
    api.profile(token)
      .then((res) => {
        setProfile(res.data)
        load()
      })
      .catch((err) => {
        if (err.status === 404) {
          setState({ loading: false, profileMissing: true, error: null })
        } else {
          setState({ loading: false, profileMissing: false, error: err.message })
        }
      })
  }, [token])

  return (
    <Container sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5">Welcome{profile?.name ? `, ${profile.name}` : ''}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your services, requests, and bills in one place.
      </Typography>
      {state.loading && <CircularProgress sx={{ mt: 4 }} />}
      {state.error && <Alert severity="error" sx={{ mt: 2 }}>{state.error}</Alert>}
      {state.profileMissing && <CompleteProfile onDone={load} />}
      {!state.loading && !state.error && !state.profileMissing && (
        <>
          <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Book a service</Typography>
          <ServiceGrid services={services} />
          <ItemList
            title="My service requests"
            items={requests}
            empty="No requests yet — pick a service above to book your first visit."
            serviceNames={Object.fromEntries(services.map((s) => [s.id, s.name]))}
          />
        </>
      )}
    </Container>
  )
}
