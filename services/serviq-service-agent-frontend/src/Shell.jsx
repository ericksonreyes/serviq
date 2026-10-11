import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuth } from './auth'

// Shared chrome for the agent PWA — one AppBar with the working set of
// destinations a field agent needs one-handed.
export default function Shell({ title = 'ServIQ Agent', children }) {
  const { setToken } = useAuth()
  return (
    <Box sx={{ pb: 4 }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{title}</Typography>
          <Button color="inherit" component={RouterLink} to="/">Home</Button>
          <Button color="inherit" component={RouterLink} to="/jobs">Jobs</Button>
          <Button color="inherit" component={RouterLink} to="/turn-in">Cash turn-in</Button>
          <Button color="inherit" onClick={() => setToken(null)}>Sign out</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ mt: 3 }}>
        {children}
      </Container>
    </Box>
  )
}
