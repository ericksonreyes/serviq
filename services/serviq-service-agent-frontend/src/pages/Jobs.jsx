import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert, Card, CardContent, Chip, CircularProgress, Stack, Typography,
} from '@mui/material'
import { api } from '../api'
import { useAuth } from '../auth'
import Shell from '../Shell'
import { addressText, STATUS_COLORS, STATUS_LABELS } from '../format'

const SECTIONS = [
  ['assigned', 'To check in'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
]

export default function Jobs() {
  const { token } = useAuth()
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.myJobs(token)
      .then((res) => setJobs(res.data ?? []))
      .catch((err) => setError(err.message))
  }, [token])

  return (
    <Shell title="My jobs">
      {!jobs && !error && <CircularProgress sx={{ mt: 4 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {jobs && jobs.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No jobs yet — accepted assignments appear here.
        </Typography>
      )}
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
                        <Typography variant="caption" color="text.secondary">{j.scheduled_for}</Typography>
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
    </Shell>
  )
}
