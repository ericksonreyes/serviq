import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import MiniCalendar from '../MiniCalendar'

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
    address_id: '', address: { line1: '' }, notes: '',
  })
  // Cascading location pick — city/municipality (search) then barangay
  // (children). The submitted code is the deepest pick; `coverage` holds
  // the preflight verdict so unsupported areas fail before submission.
  const [city, setCity] = useState(null)
  const [barangay, setBarangay] = useState(null)
  const [cityInput, setCityInput] = useState('')
  const [cityOpts, setCityOpts] = useState([])
  const [brgyOpts, setBrgyOpts] = useState([])
  const [citySearching, setCitySearching] = useState(false)
  const [coverage, setCoverage] = useState(null)
  const [interest, setInterest] = useState(null) // null | 'sending' | 'sent'
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

  // Availability drives the pickers when known — the calendar only
  // enables dates the service reports as bookable, and start times come
  // from the day's hourly `hours` (server-flagged by agent coverage).
  // If the endpoint can't be reached (slots === null) the plain
  // date/time fields stay as the fallback.
  useEffect(() => {
    if (!form.service_id) { setSlots(null); return }
    const from = new Date()
    const to = new Date(Date.now() + 45 * 86400000)
    api.availability(token, form.service_id, isoDate(from), isoDate(to))
      .then((res) => setSlots(Object.fromEntries((res.data || []).map((d) => [d.date, d]))))
      .catch(() => setSlots(null))
  }, [token, form.service_id])

  // City/municipality search — debounced like the other filter inputs.
  useEffect(() => {
    if (form.address_id || cityInput.length < 2) { setCityOpts([]); return }
    const t = setTimeout(() => {
      setCitySearching(true)
      api.locationSearch(token, cityInput, 'city,municipality,submunicipality')
        .then((res) => setCityOpts(res.data || []))
        .catch(() => setCityOpts([]))
        .finally(() => setCitySearching(false))
    }, 500)
    return () => clearTimeout(t)
  }, [token, cityInput, form.address_id])

  // Picking a city loads its barangays; a new city resets the pick.
  useEffect(() => {
    setBarangay(null)
    setBrgyOpts([])
    setCoverage(null)
    setInterest(null)
    if (!city) return
    api.locationChildren(token, city.code)
      .then((res) => setBrgyOpts(res.data || []))
      .catch(() => setBrgyOpts([]))
  }, [token, city])

  // Preflight coverage once the deepest pick resolves — the backend
  // re-checks at submission; this only shapes early feedback.
  useEffect(() => {
    setCoverage(null)
    setInterest(null)
    const code = form.address_id
      ? addresses.find((a) => a.id === form.address_id)?.address?.admin_code
      : barangay?.code
    if (!code) return
    api.coverageCheck(token, code)
      .then((res) => setCoverage(res.data))
      .catch(() => setCoverage(null))
  }, [token, barangay, form.address_id, addresses])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const setAddr = (key) => (e) =>
    setForm({ ...form, address: { ...form.address, [key]: e.target.value } })

  // Hourly candidate starts for the chosen date — the server emits
  // `hours` flagged by agent coverage; fall back to deriving hourly
  // starts from the operating window (all assumed available).
  const hourOptions = useMemo(() => {
    const day = slots?.[form.date]
    if (!day) return []
    if (Array.isArray(day.hours)) return day.hours
    if (!day?.open || !day?.close || !day?.job_minutes) return []
    const [oh, om] = day.open.split(':').map(Number)
    const [ch, cm] = day.close.split(':').map(Number)
    const out = []
    for (let t = oh * 60 + om; t < ch * 60 + cm; t += 60) {
      out.push({
        time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
        available: t + day.job_minutes <= ch * 60 + cm,
      })
    }
    return out
  }, [slots, form.date])

  // Keep the selection valid: a date that lost capacity is cleared, a
  // time outside the day's bookable hours snaps to the first available.
  useEffect(() => {
    if (slots !== null && form.date && !slots[form.date]) {
      setForm((f) => ({ ...f, date: '', time: '' }))
      return
    }
    const bookable = hourOptions.filter((h) => h.available).map((h) => h.time)
    if (hourOptions.length && !bookable.includes(form.time)) {
      setForm((f) => ({ ...f, time: bookable[0] || '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, form.date, hourOptions])

  const fmtTime = (t) => t === '24:00'
    ? 'midnight'
    : new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  const submit = async (e) => {
    e.preventDefault()
    if (!form.date) {
      setError('Pick a preferred date for your visit.')
      return
    }
    if (coverage?.covered === false) {
      setError('That address is outside the provider\'s service area — pick a different location.')
      return
    }
    setBusy(true)
    setError(null)
    const scheduled = form.date
      ? `${form.date}T${form.time || '09:00'}:00`
      : null
    const address = form.address_id
      ? null
      : {
          line1: form.address.line1,
          city: city?.name,
          barangay: barangay?.name,
          admin_code: barangay?.code,
        }
    try {
      const res = await api.createRequest(token, {
        service_id: form.service_id,
        preferred_date: form.date || null,
        scheduled_for: scheduled,
        ...(form.address_id ? { address_id: form.address_id } : { address }),
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tell us what you need, where, and when — we'll confirm your booking.
      </Typography>
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
                <Autocomplete
                  options={cityOpts}
                  value={city}
                  inputValue={cityInput}
                  loading={citySearching}
                  filterOptions={(x) => x}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(o, v) => o.code === v.code}
                  onChange={(_e, v) => setCity(v)}
                  onInputChange={(_e, v, reason) => { if (reason !== 'reset') setCityInput(v) }}
                  renderInput={(params) => (
                    <TextField {...params} label="City / municipality" required
                      helperText={cityInput.length < 2 ? 'Type at least 2 letters to search' : ' '}
                    />
                  )}
                  renderOption={(props, o) => (
                    <li {...props} key={o.code}>
                      <Box>
                        <Typography variant="body2">{o.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{o.path}</Typography>
                      </Box>
                    </li>
                  )}
                />
                <Autocomplete
                  options={brgyOpts}
                  value={barangay}
                  disabled={!city}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(o, v) => o.code === v.code}
                  onChange={(_e, v) => setBarangay(v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Barangay" required
                      helperText={city ? ' ' : 'Pick a city first'}
                    />
                  )}
                />
                {coverage?.covered === false && (
                  <Alert severity="warning"
                    action={barangay && interest !== 'sent' && (
                      <Button size="small" disabled={interest === 'sending'}
                        onClick={async () => {
                          setInterest('sending')
                          try { await api.coverageInterest(token, barangay.code); setInterest('sent') }
                          catch { setInterest(null) }
                        }}
                      >
                        {interest === 'sending' ? 'Sending…' : 'Let them know I\'m interested'}
                      </Button>
                    )}
                  >
                    {interest === 'sent'
                      ? 'Done — the provider can see demand from your area.'
                      : <>
                          Sorry — we don't cover {barangay?.name ?? 'this location'} yet.
                          {coverage.covered_names?.length > 0 && (
                            <> We currently serve: <strong>{coverage.covered_names.join(', ')}</strong>.</>
                          )}
                        </>}
                  </Alert>
                )}
              </Stack>
            )}

            {slots === null ? (
              // Availability unknown — plain pickers; still bookable.
              <>
                <TextField
                  label="Preferred date" type="date" required
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={form.date} onChange={set('date')}
                />
                <TextField
                  label="Preferred time" type="time"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={form.time} onChange={set('time')}
                />
              </>
            ) : (
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Preferred date</Typography>
                  <MiniCalendar
                    enabled={slots}
                    value={form.date}
                    onChange={(d) => setForm({ ...form, date: d })}
                  />
                </Box>
                {form.date && hourOptions.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Start time
                      {slots[form.date]?.open && slots[form.date]?.close && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          {fmtTime(slots[form.date].open)} – {fmtTime(slots[form.date].close)}
                        </Typography>
                      )}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {hourOptions.map((h) => (
                        <Chip
                          key={h.time}
                          size="small"
                          label={fmtTime(h.time)}
                          color={form.time === h.time ? 'primary' : 'default'}
                          variant={form.time === h.time ? 'filled' : 'outlined'}
                          disabled={!h.available}
                          onClick={() => h.available && setForm({ ...form, time: h.time })}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                {form.date && hourOptions.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No start times fit that day — pick another date.
                  </Typography>
                )}
              </Stack>
            )}
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
