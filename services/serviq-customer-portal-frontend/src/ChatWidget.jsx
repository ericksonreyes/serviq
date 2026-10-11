import { useEffect, useRef, useState } from 'react'
import {
  Box, CircularProgress, Fab, IconButton, Paper, Stack,
  TextField, Typography,
} from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import { api } from './api'
import { useAuth } from './auth'

// Floating assistant — customer profile only (the BFF pins the profile
// server-side; the widget just renders reply + tool-call summaries).
export default function ChatWidget() {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Hi! I can help with booking, request status, or questions about our services.' },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const send = async (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await api.chat(token, text)
      setMessages((m) => [...m, {
        role: 'agent',
        text: res.reply || '…',
        tools: (res.tool_calls || []).map((t) => t.summary || t.tool).filter(Boolean),
      }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'agent', text: `Sorry — ${err.message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {open && (
        <Paper
          elevation={6}
          sx={{
            position: 'fixed', bottom: { xs: 76, sm: 88 }, right: { xs: 12, sm: 24 },
            width: { xs: 'calc(100vw - 24px)', sm: 360 }, maxHeight: '60vh',
            display: 'flex', flexDirection: 'column', zIndex: 1300, overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 2, py: 1.5, bgcolor: '#0f172a', color: 'white', display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>ServIQ Assistant</Typography>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'white' }} aria-label="Close chat">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
            <Stack spacing={1.5}>
              {messages.map((m, i) => (
                <Box
                  key={i}
                  sx={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    bgcolor: m.role === 'user' ? 'primary.main' : 'grey.100',
                    color: m.role === 'user' ? 'white' : 'text.primary',
                    borderRadius: 3, px: 1.5, py: 1,
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Typography>
                  {m.tools?.map((t, j) => (
                    <Typography key={j} variant="caption" display="block" sx={{ opacity: 0.75, mt: 0.5 }}>
                      {t}
                    </Typography>
                  ))}
                </Box>
              ))}
              {busy && <CircularProgress size={20} />}
              <div ref={endRef} />
            </Stack>
          </Box>
          <Stack component="form" direction="row" spacing={1} onSubmit={send} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <TextField
              size="small" fullWidth placeholder="Ask about a service or booking…"
              value={draft} onChange={(e) => setDraft(e.target.value)}
            />
            <IconButton type="submit" color="primary" disabled={busy || !draft.trim()} aria-label="Send">
              <SendIcon />
            </IconButton>
          </Stack>
        </Paper>
      )}
      <Fab
        color="primary" aria-label="Open chat"
        onClick={() => setOpen((o) => !o)}
        sx={{ position: 'fixed', bottom: { xs: 16, sm: 24 }, right: { xs: 12, sm: 24 }, zIndex: 1300 }}
      >
        <ChatIcon />
      </Fab>
    </>
  )
}
