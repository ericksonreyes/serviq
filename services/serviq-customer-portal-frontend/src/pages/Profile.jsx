import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, CardContent, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Stack, TextField, Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import { api } from '../api'
import { useAuth } from '../auth'

const EMPTY_ADDRESS = { label: '', line1: '', barangay: '', city: '', is_default: false }

function AddressDialog({ open, initial, onClose, onSave, busy }) {
  const [form, setForm] = useState(EMPTY_ADDRESS)
  useEffect(() => { setForm(initial || EMPTY_ADDRESS) }, [initial, open])
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{initial?.id ? 'Edit address' : 'Add address'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Label (Home, Office…)" value={form.label} onChange={set('label')} />
          <TextField label="Street / house no." required value={form.line1} onChange={set('line1')} />
          <TextField label="Barangay / district" value={form.barangay} onChange={set('barangay')} />
          <TextField label="City" required value={form.city} onChange={set('city')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !form.line1 || !form.city} onClick={() => onSave(form)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Account + address book — profile fields PATCH through to CRM, the
// address book is a first-class CRUD list.
export default function Profile() {
  const { token } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [addresses, setAddresses] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState({ open: false, initial: null })

  const load = () => {
    Promise.all([api.profile(token), api.addresses(token)])
      .then(([p, a]) => {
        setProfile(p.data)
        setForm({
          name: p.data.name || '',
          email: p.data.contact?.email || '',
          phone: p.data.contact?.phone || '',
        })
        setAddresses(a.data || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [token])

  const saveProfile = async (e) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await api.updateProfile(token, {
        name: form.name,
        contact: { email: form.email || null, phone: form.phone || null },
      })
      setNotice('Profile saved.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveAddress = async (formAddr) => {
    setBusy(true)
    try {
      const body = {
        label: formAddr.label || null,
        address: { line1: formAddr.line1, barangay: formAddr.barangay || null, city: formAddr.city },
        is_default: formAddr.is_default || addresses.length === 0,
      }
      if (formAddr.id) {
        await api.updateAddress(token, formAddr.id, body)
      } else {
        await api.addAddress(token, body)
      }
      setDialog({ open: false, initial: null })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeAddress = async (id) => {
    await api.deleteAddress(token, id).catch((err) => setError(err.message))
    load()
  }

  if (loading) return <Container sx={{ mt: 4 }}><CircularProgress /></Container>

  return (
    <Container maxWidth="sm" sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5" gutterBottom>Profile</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Account</Typography>
          <Stack component="form" spacing={2} onSubmit={saveProfile}>
            <TextField label="Full name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextField label="Email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField label="Phone" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: 'flex-start' }}>
              Save
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Address book</Typography>
        <Button size="small" variant="outlined" onClick={() => setDialog({ open: true, initial: null })}>
          Add address
        </Button>
      </Stack>
      {addresses.length === 0 && (
        <Typography color="text.secondary">No saved addresses — add one to book faster.</Typography>
      )}
      <Stack spacing={1.5}>
        {addresses.map((a) => (
          <Card key={a.id}>
            <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flexGrow: 1 }}>
                <Typography variant="subtitle1">
                  {a.label || 'Address'} {a.is_default && <Chip size="small" label="Default" sx={{ ml: 1 }} />}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[a.address?.line1, a.address?.barangay, a.address?.city].filter(Boolean).join(', ')}
                </Typography>
              </div>
              <IconButton aria-label="Edit" onClick={() => setDialog({
                open: true,
                initial: {
                  id: a.id, label: a.label || '', line1: a.address?.line1 || '',
                  barangay: a.address?.barangay || '', city: a.address?.city || '',
                  is_default: a.is_default,
                },
              })}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton aria-label="Delete" onClick={() => removeAddress(a.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <AddressDialog
        open={dialog.open}
        initial={dialog.initial}
        busy={busy}
        onClose={() => setDialog({ open: false, initial: null })}
        onSave={saveAddress}
      />
      {profile && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          Customer ID {profile.id}
        </Typography>
      )}
    </Container>
  )
}
