import { useEffect, useState } from 'react'
import {
  Alert, AppBar, Button, Card, CardContent, CircularProgress,
  Container, Stack, Toolbar, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Home() {
  const { token, claims, setToken } = useAuth()
  const [home, setHome] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.agentHome(token, claims.sub)
      .then((res) => setHome(res.data ?? res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token, claims])

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>ServIQ Agent</Typography>
          <Button color="inherit" onClick={() => setToken(null)}>Sign out</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ mt: 3, pb: 4 }}>
        <Typography variant="h6">Today's assignments</Typography>
        {loading && <CircularProgress sx={{ mt: 4 }} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {!loading && !error && !home && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>No assignments.</Typography>
        )}
        {!loading && !error && home && (
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
                  {JSON.stringify(home, null, 2)}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Container>
    </>
  )
}
