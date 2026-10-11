import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, CardContent, Chip, CircularProgress,
  Container, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

const isoDate = (d) => d.toISOString().slice(0, 10)

// Booking: service → date (with availability hints when the catalog
// exposes them) → address book entry or inline address → notes.
export default function Book() {
  const { token } = useAuth()
  const { serviceId } = useParams()
  const navigate = useNavigate()

  const [services, setServices] = useState([])
  const [addresses, setAddresses] = useState([])
  const [form, setForm] = useState({
    service_id: serviceId || '', date: '', time: '',
    address_id: '', address: { line1: '', barangay: '', city: '' }, notes: '',
  })
  const [slots, setSlots] = useState(null) // null = availability unknown
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.catalog(token), api.addresses(token).catch(() => ({ data: [] }))])
      .then(([svc, addr]) => {
        setServices((svc.data || []).filter((s) => s.active ?? true))
        setAddresses(addr.data || [])
        const def = (addr.data || []).find((a) => a.is_default)
        if (def) setForm((f) => ({ ...f, address_id: def.id }))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  // Availability is advisory — if the catalog has no endpoint yet, the
  // plain date picker still submits preferred_date.
  useEffect(() => {
    if (!form.service_id) { setSlots(null); return }
    const from = new Date()
    const to = new Date(Date.now() + 14 * 86400000)
    api.availability(token, form.service_id, isoDate(from), isoDate(to))
      .then((res) => setSlots(Object.fromEntries((res.data || []).map((d) => [d.date, d.slots]))))
      .catch(() => setSlots(null))
  }, [token, form.service_id])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const setAddr = (key) => (e) =>
    setForm({ ...form, address: { ...form.address, [key]: e.target.value } })

  const dates = useMemo(() => {
    const out = []
    for (let i = 1; i <= 14; i++) out.push(isoDate(new Date(Date.now() + i * 86400000)))
    return out
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const scheduled = form.date
      ? `${form.date}T${form.time || '09:00'}:00`
      : null
    try {
      const res = await api.createRequest(token, {
        service_id: form.service_id,
        preferred_date: form.date || null,
        scheduled_for: scheduled,
        ...(form.address_id
          ? { address_id: form.address_id }
          : { address: Object.values(form.address).some(Boolean) ? form.address : null }),
        notes: form.notes || null,
      })
      navigate(`/requests/${res.data.id}`)
    } catch (err) {
      const first = err.fields ? Object.values(err.fields).flat()[0] : null
      setError(first || err.message)
      setBusy(false)
    }
  }

  if (loading) return <Container sx={{ mt: 4 }}><CircularProgress /></Container>

  return (
    <Container maxWidth="sm" sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5" gutterBottom>Book a service</Typography>
      {services.length === 0 && !error ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No bookable services yet. <Link to="/">Back home</Link>
        </Alert>
      ) : (
        <Card><CardContent>
          <Stack component="form" spacing={2.5} onSubmit={submit} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              select label="Service" required value={form.service_id}
              onChange={set('service_id')}
            >
              {services.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>

            <TextField
              select label="Address" required
              value={form.address_id || 'new'}
              onChange={(e) => setForm({ ...form, address_id: e.target.value === 'new' ? '' : e.target.value })}
              helperText="Saved addresses are managed on your Profile page."
            >
              {addresses.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.label || 'Address'} — {a.address?.line1}, {a.address?.city}
                </MenuItem>
              ))}
              <MenuItem value="new">Enter a new address</MenuItem>
            </TextField>
            {!form.address_id && (
              <Stack spacing={2}>
                <TextField label="Street / house no." required {...{ value: form.address.line1, onChange: setAddr('line1') }} />
                <TextField label="Barangay / district" {...{ value: form.address.barangay, onChange: setAddr('barangay') }} />
                <TextField label="City" required {...{ value: form.address.city, onChange: setAddr('city') }} />
              </Stack>
            )}

            <TextField
              label="Preferred date" type="date" required InputLabelProps={{ shrink: true }}
              value={form.date} onChange={set('date')}
            />
            {slots && form.service_id && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {dates.map((d) => (
                  <Chip
                    key={d}
                    size="small"
                    label={`${new Date(`${d}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${slots[d] ? ` · ${slots[d]}` : ''}`}
                    color={form.date === d ? 'primary' : 'default'}
                    variant={slots[d] ? 'filled' : 'outlined'}
                    onClick={() => setForm({ ...form, date: d })}
                    disabled={!slots[d]}
                  />
                ))}
              </Stack>
            )}
            <TextField
              label="Preferred time" type="time" InputLabelProps={{ shrink: true }}
              value={form.time} onChange={set('time')}
            />
            <TextField
              label="Notes for the technician" multiline minRows={2}
              value={form.notes} onChange={set('notes')}
            />
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </Button>
          </Stack>
        </CardContent></Card>
      )}
    </Container>
  )
}
