import { Link } from 'react-router-dom'
import { Button, Container, Stack, Typography } from '@mui/material'

export default function Landing() {
  return (
    <Container maxWidth="sm" sx={{ mt: 12, textAlign: 'center' }}>
      <Typography variant="h3" gutterBottom>ServIQ</Typography>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        Field service operations, end to end — requests, dispatch,
        execution, billing.
      </Typography>
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 4 }}>
        <Button component={Link} to="/login" variant="contained">Sign in</Button>
        <Button component={Link} to="/signup" variant="outlined">Create an account</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 6 }}>
        Have a provider link? It looks like <code>/provider/quickrepairguys</code> —
        it takes you straight to your provider's sign-in.
      </Typography>
    </Container>
  )
}
