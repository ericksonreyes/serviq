import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Login({ tenantSlug }) {
  const { setToken } = useAuth()
  const [form, setForm] = useState({ username: '', password: '', tenant: tenantSlug || '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(form)
      setToken(res.access_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="xs" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>ServIQ Customer Portal</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Sign in to track your service requests and jobs.
        </Typography>
        <Stack component="form" spacing={2} onSubmit={submit} sx={{ mt: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Username" required {...field('username')} />
          <TextField label="Password" type="password" required {...field('password')} />
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Typography variant="body2">
            New customer? <Link to={tenantSlug ? `/provider/${tenantSlug}/signup` : '/signup'}>Create an account</Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  )
}
