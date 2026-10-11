// Display helpers shared by the agent screens.

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export const money = (cents) => peso.format((cents ?? 0) / 100)

// Address records are JSON: { line1, barangay, city, lat, lng, ... }.
export function addressText(addr) {
  if (!addr) return null
  if (typeof addr === 'string') return addr
  return [addr.line1, addr.line2, addr.barangay, addr.city, addr.province]
    .filter(Boolean).join(', ') || null
}

// Universal maps deep link — opens turn-by-turn navigation on mobile.
export function navigateUrl(addr) {
  if (!addr || typeof addr !== 'object') {
    const text = addressText(addr)
    return text ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}` : null
  }
  const dest = addr.lat && addr.lng ? `${addr.lat},${addr.lng}` : addressText(addr)
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null
}

export const shortId = (id) => (id ? `${id.slice(0, 8)}…` : '')

export const STATUS_LABELS = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  open: 'Open',
  'in-progress': 'In progress',
  closed: 'Done',
}

export const STATUS_COLORS = {
  assigned: 'info',
  in_progress: 'warning',
  'in-progress': 'warning',
  completed: 'success',
  closed: 'success',
  open: 'default',
}
