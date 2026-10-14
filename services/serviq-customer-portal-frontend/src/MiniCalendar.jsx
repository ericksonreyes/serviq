import { useMemo, useState } from 'react'
import { Box, IconButton, Typography } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const iso = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Minimal month calendar for availability picking — only `enabled` dates
// are selectable (server-emitted bookable days); everything else renders
// disabled. `closed` marks provider-declared closures/holidays with a
// strikethrough + tooltip, so a closed day reads differently from a
// merely full or out-of-window one. No date-lib dependency: pure Date
// math.
export default function MiniCalendar({ enabled, closed = {}, value, onChange, maxMonths = 2 }) {
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])

  const [view, setView] = useState(() =>
    new Date(today.getFullYear(), today.getMonth() + (value ? monthOffset(today, value) : 0), 1))

  function monthOffset(base, isoStr) {
    const [y, m] = isoStr.split('-').map(Number)
    return (y - base.getFullYear()) * 12 + (m - 1 - base.getMonth())
  }

  const cells = useMemo(() => {
    const y = view.getFullYear()
    const m = view.getMonth()
    const first = new Date(y, m, 1).getDay()
    const days = new Date(y, m + 1, 0).getDate()
    const out = []
    for (let i = 0; i < first; i++) out.push(null)
    for (let d = 1; d <= days; d++) out.push(iso(y, m, d))
    return out
  }, [view])

  const maxView = new Date(today.getFullYear(), today.getMonth() + maxMonths, 1)
  const canPrev = view > new Date(today.getFullYear(), today.getMonth(), 1)
  const canNext = view < maxView

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <IconButton size="small" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
          disabled={!canPrev} aria-label="Previous month">
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Typography>
        <IconButton size="small" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
          disabled={!canNext} aria-label="Next month">
          <ChevronRightIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
        {WEEKDAYS.map((w) => (
          <Typography key={w} variant="caption" align="center"
            sx={{ color: 'text.secondary', fontWeight: 700, py: 0.5 }}>
            {w}
          </Typography>
        ))}
        {cells.map((d, i) => {
          if (!d) return <Box key={`x${i}`} />
          const date = new Date(`${d}T00:00:00`)
          const off = date < today || !enabled?.[d]
          const isClosed = off && Boolean(closed[d])
          const selected = value === d
          return (
            <Box
              key={d}
              component="button"
              type="button"
              disabled={off}
              onClick={() => onChange(d)}
              title={isClosed ? 'Closed — provider\'s day off' : undefined}
              aria-label={`${date.toLocaleDateString(undefined, { dateStyle: 'medium' })}${isClosed ? ' (closed)' : ''}`}
              aria-pressed={selected}
              sx={{
                minHeight: 40,
                border: 'none',
                borderRadius: 1.5,
                cursor: off ? 'default' : 'pointer',
                font: 'inherit',
                fontSize: '1rem',
                fontWeight: selected ? 800 : 500,
                textDecoration: isClosed ? 'line-through' : 'none',
                color: off ? 'text.disabled' : selected ? 'primary.contrastText' : 'text.primary',
                bgcolor: selected ? 'primary.main' : 'transparent',
                '&:not(:disabled):hover': { bgcolor: selected ? 'primary.main' : 'rgba(124, 58, 237, 0.08)' },
              }}
            >
              {Number(d.slice(8))}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
