import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import Shell from '../Shell'
import { addressText, fmtDateTime, STATUS_COLORS, STATUS_LABELS } from '../format'

const SECTIONS = [
  ['assigned', 'To check in'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
]

export default function Jobs() {
  const { token } = useAuth()
  const [env, setEnv] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.myJobs(token, page)
      .then((res) => setEnv(res))
      .catch((err) => setError(err.message))
  }, [token, page])

  const jobs = env ? env.data ?? [] : null

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

  return (
    <Shell title="My jobs" desc="Your assigned work — tap a job for steps, evidence, and customer confirmation.">
      {!jobs && !error && <CircularProgress sx={{ mt: 4 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {jobs && jobs.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No jobs yet — accepted assignments appear here.
        </Typography>
      )}
      {pager}
      {jobs && SECTIONS.map(([status, title]) => {
        const rows = jobs.filter((j) => j.status === status)
        if (rows.length === 0) return null
        return (
          <div key={status}>
            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>{title}</Typography>
            <Stack spacing={1.5}>
              {rows.map((j) => (
                <Card key={j.execution_id} component={RouterLink} to={`/jobs/${j.execution_id}`}
                  sx={{ textDecoration: 'none', display: 'block' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Chip size="small" color={STATUS_COLORS[j.status] || 'default'}
                        label={STATUS_LABELS[j.status] || j.status} />
                      {j.scheduled_for && (
                        <Typography variant="caption" color="text.secondary">{fmtDateTime(j.scheduled_for)}</Typography>
                      )}
                    </Stack>
                    <Typography variant="subtitle1">
                      {j.customer?.name || `Job ${j.job_id?.slice(0, 8)}…`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {addressText(j.address) || 'No address on file'}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </div>
        )
      })}
      {pager}
    </Shell>
  )
}
