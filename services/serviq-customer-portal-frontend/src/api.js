const API_URL = import.meta.env.VITE_API_BASE_URL
const IDENTITY_URL = import.meta.env.VITE_IDENTITY_API_URL
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_API_URL

// auth.jsx registers a refresh handler — a 401 on an authed call tries one
// silent refresh + retry before surfacing the error.
let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

// App.jsx registers a maintenance handler — a 503 with error 'maintenance'
// means the customer-portal feature flag is off; the app flips to the
// maintenance screen.
let onMaintenance = null
export const setMaintenanceHandler = (fn) => { onMaintenance = fn }

async function request(base, path, { token, method = 'GET', body, _retried } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 503 && json.error === 'maintenance' && onMaintenance) onMaintenance()
  if (res.status === 401 && token && !_retried && onUnauthorized) {
    const newToken = await onUnauthorized()
    if (newToken) return request(base, path, { token: newToken, method, body, _retried: true })
  }
  if (!res.ok) {
    const err = new Error(json.message || json.error || `Request failed (${res.status})`)
    err.status = res.status
    err.fields = json.errors || null
    throw err
  }
  return json
}

// Every data call goes through the Customer Portal BFF (VITE_API_BASE_URL);
// only auth talks to IAM directly.
export const api = {
  login: (creds) => request(IDENTITY_URL, '/api/v1/auth/login', { method: 'POST', body: creds }),
  logout: (token, refreshToken) =>
    request(IDENTITY_URL, '/api/v1/auth/logout', { method: 'POST', token, body: { refresh_token: refreshToken } }),
  register: (creds) => request(IDENTITY_URL, '/api/v1/auth/register', { method: 'POST', body: creds }),
  invitation: (token) => request(IDENTITY_URL, `/api/v1/invitations/${token}`),
  acceptInvite: (token, body) =>
    request(IDENTITY_URL, `/api/v1/invitations/${token}/accept`, { method: 'POST', body }),
  // Public provider directory on Platform Management — no auth needed.
  searchProviders: (q) =>
    request(PLATFORM_URL, `/api/v1/providers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  provider: (slug) => request(PLATFORM_URL, `/api/v1/providers/${encodeURIComponent(slug)}`),
  // Public flag probe — {data:{key, enabled}}; 404 means the flag does not exist.
  featureFlag: (key) => request(PLATFORM_URL, `/api/v1/feature-flags/${encodeURIComponent(key)}`),

  catalog: (token) => request(API_URL, '/api/v1/catalog', { token }),
  service: (token, id) => request(API_URL, `/api/v1/catalog/${id}`, { token }),
  availability: (token, id, from, to) =>
    request(API_URL, `/api/v1/catalog/${id}/availability?from=${from}&to=${to}`, { token }),

  profile: (token) => request(API_URL, '/api/v1/me/profile', { token }),
  createProfile: (token, body) => request(API_URL, '/api/v1/me/profile', { token, method: 'POST', body }),
  updateProfile: (token, body) => request(API_URL, '/api/v1/me/profile', { token, method: 'PATCH', body }),

  addresses: (token) => request(API_URL, '/api/v1/me/addresses', { token }),
  addAddress: (token, body) => request(API_URL, '/api/v1/me/addresses', { token, method: 'POST', body }),
  updateAddress: (token, id, body) =>
    request(API_URL, `/api/v1/me/addresses/${id}`, { token, method: 'PATCH', body }),
  deleteAddress: (token, id) =>
    request(API_URL, `/api/v1/me/addresses/${id}`, { token, method: 'DELETE' }),

  requests: (token) => request(API_URL, '/api/v1/me/requests', { token }),
  createRequest: (token, body) => request(API_URL, '/api/v1/me/requests', { token, method: 'POST', body }),
  requestDetail: (token, id) => request(API_URL, `/api/v1/me/requests/${id}`, { token }),
  cancelRequest: (token, id) =>
    request(API_URL, `/api/v1/me/requests/${id}/cancel`, { token, method: 'POST' }),
  submitFeedback: (token, id, body) =>
    request(API_URL, `/api/v1/me/requests/${id}/feedback`, { token, method: 'POST', body }),

  jobs: (token) => request(API_URL, '/api/v1/me/jobs', { token }),

  notifications: (token, params = '') =>
    request(API_URL, `/api/v1/me/notifications${params}`, { token }),
  markRead: (token, id) =>
    request(API_URL, `/api/v1/me/notifications/${id}/read`, { token, method: 'POST' }),

  chat: (token, message, context) =>
    request(API_URL, '/api/v1/chat', { token, method: 'POST', body: { message, context } }),
}
