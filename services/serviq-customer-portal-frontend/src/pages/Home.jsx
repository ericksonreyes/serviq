import { useEffect, useState } from 'react'
import {
  Alert, AppBar, Button, Card, CardContent, CircularProgress,
  Container, Stack, Toolbar, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

function ItemList({ title, items, empty }) {
  return (
    <>
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>{title}</Typography>
      {items.length === 0 && <Typography color="text.secondary">{empty}</Typography>}
      <Stack spacing={1.5}>
        {items.map((item, i) => (
          <Card key={item._id || item.id || i}>
            <CardContent>
              <Typography variant="subtitle1">
                {item.title || item.name || item._id || `Item ${i + 1}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {item.status || ''}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </>
  )
}

export default function Home() {
  const { token, claims, setToken } = useAuth()
  const [requests, setRequests] = useState([])
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.requests(token), api.jobs(token)])
      .then(([r, j]) => { setRequests(r.data || []); setJobs(j.data || []) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>ServIQ Customer Portal</Typography>
          <Button color="inherit" onClick={() => setToken(null)}>Sign out</Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ mt: 4 }}>
        <Typography variant="h5">Welcome</Typography>
        <Typography variant="body2" color="text.secondary">
          Signed in as {claims?.sub}
        </Typography>
        {loading && <CircularProgress sx={{ mt: 4 }} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {!loading && !error && (
          <>
            <ItemList title="My service requests" items={requests} empty="No requests yet." />
            <ItemList title="My jobs" items={jobs} empty="No jobs scheduled." />
          </>
        )}
      </Container>
    </>
  )
}
