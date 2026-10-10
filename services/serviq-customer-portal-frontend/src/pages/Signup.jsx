import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Signup() {
  const { setToken } = useAuth()
  const [form, setForm] = useState({
    display_name: '', username: '', email: '',
    tenant_id: '', password: '', password_confirmation: '',
  })
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
      const res = await api.register(form)
      setToken(res.access_token)
    } catch (err) {
      const first = err.fields ? Object.values(err.fields).flat()[0] : null
      setError(first || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="xs" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h5" gutterBottom>Create your account</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Sign up under your service provider to request and track work.
        </Typography>
        <Stack component="form" spacing={2} onSubmit={submit} sx={{ mt: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Full name" required {...field('display_name')} />
          <TextField label="Username" required {...field('username')} />
          <TextField label="Email" type="email" required {...field('email')} />
          <TextField
            label="Service Provider ID"
            required
            helperText="The tenant ID your service provider gave you"
            {...field('tenant_id')}
          />
          <TextField label="Password" type="password" required {...field('password')} />
          <TextField label="Confirm password" type="password" required {...field('password_confirmation')} />
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Creating account…' : 'Sign up'}
          </Button>
          <Typography variant="body2">
            Already have an account? <Link to="/login">Sign in</Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  )
}
