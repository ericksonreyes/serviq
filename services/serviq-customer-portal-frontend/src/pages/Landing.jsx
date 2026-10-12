import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Box, CircularProgress, Container, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'

const FEATURES = [
  ['Requests', 'Submit and track service requests in real time'],
  ['Dispatch', 'Work routed to the right field agent, automatically'],
  ['Billing', 'Invoices and payments, end to end'],
]

export default function Landing() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Debounced directory search — empty query browses the whole directory.
  useEffect(() => {
    let stale = false
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchProviders(query.trim())
        if (!stale) {
          setResults(res.data || [])
          setError(null)
        }
      } catch (err) {
        if (!stale) setError(err.message)
      } finally {
        if (!stale) setBusy(false)
      }
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query])

  // Returning customer shortcut: a remembered provider sends them straight
  // to its sign-in. ?browse=1 is the explicit escape to the directory.
  const remembered = localStorage.getItem('serviq.provider')
  if (remembered && !params.get('browse')) {
    return <Navigate to={`/provider/${remembered}/login`} replace />
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #6d28d9 100%)', color: 'white', py: { xs: 8, sm: 12 } }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontFamily: '"Caveat", cursive', fontSize: { xs: '3.5rem', sm: '4.5rem' }, lineHeight: 1 }}>
            ServIQ
          </Typography>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 400, opacity: 0.9, fontSize: { xs: '1rem', sm: '1.15rem' } }}>
            Intelligent service operations, from request to completion.
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, opacity: 0.75 }}>
            Deliveries, repairs, installations, maintenance visits — ServIQ connects you with service
            providers and manages the whole job lifecycle end to end.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="sm" sx={{ mt: -4, pb: { xs: 5, sm: 8 } }}>
        <Paper elevation={3} sx={{ p: 2 }}>
          <TextField
            fullWidth
            placeholder="Search for a service provider"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: busy ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} />
                </InputAdornment>
              ) : null,
            }}
          />
        </Paper>

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {error && (
            <Typography color="error" variant="body2">Provider search unavailable — {error}</Typography>
          )}
          {!error && results !== null && results.length === 0 && (
            <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
              No service providers match "{query}".
            </Typography>
          )}
          {(results || []).map((p) => (
            <Paper
              key={p.slug}
              onClick={() => navigate(`/provider/${p.slug}`)}
              sx={{
                p: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1,
                transition: 'box-shadow .15s ease, transform .15s ease',
                '&:hover': { boxShadow: 4, transform: 'translateY(-1px)' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700}>{p.name}</Typography>
                {p.description && (
                  <Typography variant="body2" color="text.secondary">{p.description}</Typography>
                )}
              </Box>
              <ChevronRightIcon color="action" />
            </Paper>
          ))}
        </Stack>

        <Stack spacing={2} sx={{ mt: 5 }}>
          {FEATURES.map(([title, body]) => (
            <Box key={title} sx={{ bgcolor: 'background.paper', p: 2.5, borderRadius: 1, boxShadow: '0 1px 3px rgba(30,27,75,.08)' }}>
              <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
              <Typography variant="body2" color="text.secondary">{body}</Typography>
            </Box>
          ))}
        </Stack>
      </Container>
    </Box>
  )
}
