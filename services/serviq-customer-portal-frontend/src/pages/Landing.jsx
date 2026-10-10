import { Link } from 'react-router-dom'
import { Box, Button, Container, Stack, Typography } from '@mui/material'

const FEATURES = [
  ['Requests', 'Submit and track service requests in real time'],
  ['Dispatch', 'Work routed to the right field agent, automatically'],
  ['Billing', 'Invoices and payments, end to end'],
]

export default function Landing() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ background: 'linear-gradient(160deg, #0f172a 0%, #134e4a 100%)', color: 'white', py: { xs: 8, sm: 12 } }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '2.25rem', sm: '3rem' } }}>ServIQ</Typography>
          <Typography variant="h6" sx={{ mt: 2, fontWeight: 400, opacity: 0.85, fontSize: { xs: '1rem', sm: '1.15rem' } }}>
            Field service operations, end to end — requests, dispatch, execution, billing.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mt: 4 }}>
            <Button component={Link} to="/login" variant="contained" size="large" sx={{ bgcolor: '#14b8a6', '&:hover': { bgcolor: '#0d9488' } }}>
              Sign in
            </Button>
            <Button component={Link} to="/signup" variant="outlined" size="large" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>
              Create an account
            </Button>
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="sm" sx={{ py: { xs: 5, sm: 8 } }}>
        <Stack spacing={2}>
          {FEATURES.map(([title, body]) => (
            <Box key={title} sx={{ bgcolor: 'background.paper', p: 2.5, borderRadius: 3, boxShadow: '0 1px 3px rgba(15,23,42,.08)' }}>
              <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
              <Typography variant="body2" color="text.secondary">{body}</Typography>
            </Box>
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 5, textAlign: 'center' }}>
          Have a provider link? It looks like <code>/provider/quickrepairguys</code> —
          it takes you straight to your provider's sign-in.
        </Typography>
      </Container>
    </Box>
  )
}
