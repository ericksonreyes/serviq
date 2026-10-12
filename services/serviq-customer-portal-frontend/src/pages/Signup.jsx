import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Signup({ tenantSlug }) {
  const { setToken } = useAuth()
  const [params] = useSearchParams()
  const inviteToken = params.get('invite')
  const [invite, setInvite] = useState(null)
  const [inviteErr, setInviteErr] = useState(null)
  const [form, setForm] = useState({
    display_name: '', username: '', email: '',
    tenant: tenantSlug || '', password: '', password_confirmation: '',
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!inviteToken) return
    api.invitation(inviteToken)
      .then((res) => {
        setInvite(res.data)
        setForm((f) => ({ ...f, email: res.data.email, tenant: res.data.tenant_slug }))
      })
      .catch((e) => setInviteErr(e.message))
  }, [inviteToken])

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = invite
        ? await api.acceptInvite(inviteToken, form)
        : await api.register(form)
      setToken(res.access_token, false, res.refresh_token)
      const slug = invite?.tenant_slug || tenantSlug
      if (slug) localStorage.setItem('serviq.provider', slug)
      // Self-signup has no CRM customer record — provision it now so the
      // home view and booking work on first landing. Best-effort: the
      // first sign-in empty state catches any failure.
      api.createProfile(res.access_token, { name: form.display_name }).catch(() => {})
    } catch (err) {
      const first = err.fields ? Object.values(err.fields).flat()[0] : null
      setError(first || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: { xs: 3, sm: 8 } }}>
      <Paper sx={{ p: { xs: 4, sm: 6 }, width: "100%", maxWidth: 460, mx: "auto" }}>
        <Typography variant="h5" gutterBottom>Create your account</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Sign up under your service provider to request and track work.
        </Typography>
        <Stack component="form" spacing={2.5} onSubmit={submit} sx={{ mt: 3 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {inviteErr && <Alert severity="warning">Invitation link is invalid or expired — you can still sign up normally.</Alert>}
          {invite && <Alert severity="info">You were invited by {invite.tenant_slug} — finish creating your account.</Alert>}
          <TextField label="Full name" required {...field('display_name')} />
          <TextField label="Username" required {...field('username')} />
          <TextField label="Email" type="email" required disabled={!!invite} {...field('email')} />
          <TextField label="Password" type="password" required {...field('password')} />
          <TextField label="Confirm password" type="password" required {...field('password_confirmation')} />
          <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ py: 1.25 }}>
            {busy ? 'Creating account…' : 'Sign up'}
          </Button>
          <Typography variant="body2">
            Already have an account? <Link to={tenantSlug ? `/provider/${tenantSlug}/login` : '/login'}>Sign in</Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  )
}
