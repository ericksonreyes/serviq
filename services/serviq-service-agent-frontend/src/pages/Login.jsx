import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Checkbox, Container, FormControlLabel, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Login({ tenantSlug }) {
  const { setToken } = useAuth()
  const [form, setForm] = useState({ username: '', password: '', tenant: tenantSlug || '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)

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
      setToken(res.access_token, remember, res.refresh_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: { xs: 3, sm: 8 } }}>
      <Paper sx={{ p: { xs: 4, sm: 6 }, width: "100%", maxWidth: 460, mx: "auto" }}>
        <Typography variant="h5" gutterBottom>ServIQ Service Agent</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Sign in to see your assigned jobs.
        </Typography>
        <Stack component="form" spacing={2.5} onSubmit={submit} sx={{ mt: 3 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Provider" required placeholder="Your organization's slug — e.g. acme" helperText="The provider you work for" {...field('tenant')} />
          <TextField label="Username" required {...field('username')} />
          <TextField
            label="Password"
            type={showPw ? 'text' : 'password'}
            required
            {...field('password')}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPw((s) => !s)}
                      edge="end"
                    >
                      {showPw ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
            label="Keep me signed in"
          />
          <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ py: 1.25 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Typography variant="body2">
            Applying as an agent? <Link to={tenantSlug ? `/provider/${tenantSlug}/signup` : '/signup'}>Sign up</Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  )
}
