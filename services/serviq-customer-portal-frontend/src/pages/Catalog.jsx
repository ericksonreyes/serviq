import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Grid, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

const money = (cents, currency = 'PHP') =>
  cents == null ? null : `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

// Service discovery — the tenant's catalog via the BFF.
export default function Catalog() {
  const { token } = useAuth()
  const [services, setServices] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.catalog(token)
      .then((res) => setServices(res.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const visible = services.filter((s) =>
    (s.active ?? true) &&
    `${s.name} ${s.description || ''}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <Container sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5">Services</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pick a service to book a visit.
      </Typography>
      <TextField
        fullWidth size="small" placeholder="Search services…"
        value={query} onChange={(e) => setQuery(e.target.value)} sx={{ mb: 3 }}
      />
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && visible.length === 0 && (
        <Typography color="text.secondary">No services match.</Typography>
      )}
      <Grid container spacing={2}>
        {visible.map((s) => (
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
    </Container>
  )
}
