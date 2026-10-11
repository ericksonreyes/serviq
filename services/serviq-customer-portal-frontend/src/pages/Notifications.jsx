import { useEffect, useState } from 'react'
import {
  Alert, Card, CardContent, CircularProgress, Container,
  List, ListItemButton, Stack, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'

// In-app notification feed — unread rows highlight and mark-read on open.
export default function Notifications() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.notifications(token)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data?.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const open = async (n) => {
    if (n.read_at) return
    try {
      await api.markRead(token, n.id)
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
    } catch { /* read marker is best-effort */ }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, pb: 10 }}>
      <Typography variant="h5" gutterBottom>Notifications</Typography>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && items.length === 0 && (
        <Typography color="text.secondary">You're all caught up.</Typography>
      )}
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
                    {new Date(n.created_at).toLocaleString()}
                  </Typography>
                </CardContent>
              </ListItemButton>
            </List>
          </Card>
        ))}
      </Stack>
    </Container>
  )
}
