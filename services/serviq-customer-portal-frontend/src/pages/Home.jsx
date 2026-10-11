import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert, Button, Card, CardContent, CircularProgress,
  Container, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

const STATUS_LABELS = {
  submitted: 'Received', converted: 'Scheduled', cancelled: 'Cancelled',
  requested: 'Requested', confirmed: 'Confirmed', finding_agent: 'Finding a technician',
  assigned: 'Technician assigned', en_route: 'Technician en route',
  in_progress: 'Service started', completed: 'Completed',
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
                {item.preferred_date ? ` · Preferred ${item.preferred_date}` : ''}
                {item.scheduled_for ? ` · Scheduled ${new Date(item.scheduled_for).toLocaleString()}` : ''}
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
  const { token, claims } = useAuth()
  const [state, setState] = useState({ loading: true, profileMissing: false, error: null })
  const [requests, setRequests] = useState([])
  const [serviceNames, setServiceNames] = useState({})

  const load = async () => {
    try {
      const [reqs, services] = await Promise.all([
        api.requests(token),
        api.catalog(token).catch(() => ({ data: [] })),
      ])
      setRequests(reqs.data || [])
      setServiceNames(Object.fromEntries((services.data || []).map((s) => [s.id, s.name])))
      setState({ loading: false, profileMissing: false, error: null })
    } catch (err) {
      setState({ loading: false, profileMissing: false, error: err.message })
    }
  }

  useEffect(() => {
    api.profile(token)
      .then(() => load())
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
      <Typography variant="h5">Welcome</Typography>
      {state.loading && <CircularProgress sx={{ mt: 4 }} />}
      {state.error && <Alert severity="error" sx={{ mt: 2 }}>{state.error}</Alert>}
      {state.profileMissing && <CompleteProfile onDone={load} />}
      {!state.loading && !state.error && !state.profileMissing && (
        <>
          <Typography variant="body2" color="text.secondary">
            Signed in as {claims?.sub}
          </Typography>
          {requests.length === 0 && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="subtitle1">Nothing booked yet</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Browse your provider's services and book your first visit.
                </Typography>
                <Button variant="contained" component={Link} to="/catalog">Browse services</Button>
              </CardContent>
            </Card>
          )}
          <ItemList
            title="My service requests"
            items={requests}
            empty="No requests yet — browse the catalog to book a service."
            serviceNames={serviceNames}
          />
          <Button component={Link} to="/catalog" variant="outlined" sx={{ mt: 3 }}>
            Book a service
          </Button>
        </>
      )}
    </Container>
  )
}
