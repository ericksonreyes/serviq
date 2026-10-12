import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Box, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material'
import { api } from '../api'

export default function ProviderHome() {
  const { slug } = useParams()
  const [provider, setProvider] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setProvider(null)
    setMissing(false)
    api.provider(slug)
      .then((res) => setProvider(res.data))
      .catch(() => setMissing(true))
  }, [slug])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #6d28d9 100%)', color: 'white', py: { xs: 7, sm: 10 }, flex: 1 }}>
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          {!provider && !missing && <CircularProgress sx={{ color: 'white' }} />}
          {missing && (
            <>
              <Typography variant="h5" fontWeight={700}>Provider not found</Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.8 }}>
                We couldn't find a service provider at this address.
              </Typography>
              <Button component={Link} to="/" variant="outlined" sx={{ mt: 3, color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>
                Search providers
              </Button>
            </>
          )}
          {provider && (
            <>
              <Typography sx={{ fontFamily: '"Caveat", cursive', fontSize: '1.6rem', opacity: 0.75 }}>ServIQ</Typography>
              <Typography variant="h3" sx={{ mt: 1, fontSize: { xs: '2rem', sm: '2.75rem' }, fontWeight: 800 }}>
                {provider.name}
              </Typography>
              {provider.description && (
                <Typography variant="h6" sx={{ mt: 2, fontWeight: 400, opacity: 0.85, fontSize: { xs: '1rem', sm: '1.1rem' } }}>
                  {provider.description}
                </Typography>
              )}
              <Paper elevation={4} sx={{ mt: 4, p: 3 }}>
                <Stack spacing={2}>
                  <Button component={Link} to={`/provider/${slug}/login`} variant="contained" size="large">
                    Sign in
                  </Button>
                  <Button component={Link} to={`/provider/${slug}/signup`} variant="outlined" size="large">
                    Create an account
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    New here? Create an account to book services with {provider.name}.
                  </Typography>
                </Stack>
              </Paper>
            </>
          )}
        </Container>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        Powered by <Link to="/?browse=1" style={{ color: 'inherit' }}>ServIQ</Link>
      </Typography>
    </Box>
  )
}
