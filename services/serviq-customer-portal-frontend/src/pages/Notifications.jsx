import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, CardContent, CircularProgress, Container,
  List, ListItemButton, Stack, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import { fmtDateTime } from '../format'

// In-app notification feed — unread rows highlight and mark-read on open.
export default function Notifications() {
  const { token } = useAuth()
  const [env, setEnv] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.notifications(token, page)
      .then((res) => setEnv(res?.data ? res : { data: res?.data ?? res ?? [] }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token, page])

  const items = env?.data ?? []

  // Above and below the list — controls reachable without scrolling.
  const pager = env?.last_page > 1 && (
    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ my: 2 }}>
      <Button size="small" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>
      <Typography variant="caption" color="text.secondary">
        Page {env.current_page} of {env.last_page}{env.total != null ? ` · ${env.total} total` : ''}
      </Typography>
      <Button size="small" disabled={page >= env.last_page} onClick={() => setPage(page + 1)}>Next →</Button>
    </Stack>
  )

  const open = async (n) => {
    if (n.read_at) return
    try {
      await api.markRead(token, n.id)
      setEnv((e) => ({ ...e, data: e.data.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) }))
    } catch { /* read marker is best-effort */ }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5" gutterBottom>Notifications</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Updates on your requests, bookings, and payments.
      </Typography>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && items.length === 0 && (
        <Typography color="text.secondary">You're all caught up.</Typography>
      )}
      {pager}
      <Stack spacing={1.5}>
        {items.map((n) => (
          <Card key={n.id} variant={n.read_at ? 'outlined' : undefined}>
            <List disablePadding>
              <ListItemButton onClick={() => open(n)} sx={{ alignItems: 'flex-start' }}>
                <CardContent sx={{ py: 1.5, width: '100%' }}>
                  <Typography variant="subtitle2" color={n.read_at ? 'text.secondary' : 'text.primary'}>
                    {n.title || n.event_type}
                    {!n.read_at && ' •'}
                  </Typography>
                  {n.body && (
                    <Typography variant="body2" color="text.secondary">{n.body}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {fmtDateTime(n.created_at)}
                  </Typography>
                </CardContent>
              </ListItemButton>
            </List>
          </Card>
        ))}
      </Stack>
      {pager}
    </Container>
  )
}
