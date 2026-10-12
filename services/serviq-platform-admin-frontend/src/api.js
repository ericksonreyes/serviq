const IDENTITY_URL = import.meta.env.VITE_IDENTITY_API_URL
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_API_URL

// auth.jsx registers a refresh handler — a 401 on an authed call tries one
// silent refresh + retry before surfacing the error.
let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

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
  if (res.status === 401 && token && !_retried && onUnauthorized) {
    const newToken = await onUnauthorized()
    if (newToken) return request(base, path, { token: newToken, method, body, _retried: true })
  }
  if (!res.ok) {
    const err = new Error(json.message || json.error || `Request failed (${res.status})`)
    err.fields = json.errors || null
    throw err
  }
  return json
}

const get = (base, path, token) => request(base, path, { token })
const send = (base, path, token, method, body) => request(base, path, { token, method, body })

export const api = {
  // Identity & Access
  login: (creds) =>
    request(IDENTITY_URL, '/api/v1/auth/login', {
      method: 'POST',
      body: { ...creds, scope: 'platform' },
    }),
  me: (token) => get(IDENTITY_URL, '/api/v1/auth/me', token),
  logout: (token, refreshToken) =>
    request(IDENTITY_URL, '/api/v1/auth/logout', { method: 'POST', token, body: { refresh_token: refreshToken } }),
  iamUsers: (token, scope, page = 1) =>
    get(IDENTITY_URL, `/api/v1/users?${scope ? `scope=${encodeURIComponent(scope)}&` : ''}page=${page}`, token),
  createIamUser: (token, data) => send(IDENTITY_URL, '/api/v1/users', token, 'POST', data),
  updateIamUser: (token, id, data) => send(IDENTITY_URL, `/api/v1/users/${id}`, token, 'PATCH', data),
  assignIamRoles: (token, id, roles) =>
    send(IDENTITY_URL, `/api/v1/users/${id}/roles`, token, 'POST', { roles }),
  iamRoles: (token, scope) =>
    get(IDENTITY_URL, `/api/v1/roles${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, token),
  createIamRole: (token, data) => send(IDENTITY_URL, '/api/v1/roles', token, 'POST', data),
  grantRolePermissions: (token, id, permissions) =>
    send(IDENTITY_URL, `/api/v1/roles/${id}/permissions`, token, 'POST', { permissions }),
  iamPermissions: (token) => get(IDENTITY_URL, '/api/v1/permissions', token),
  iamTenants: (token) => get(IDENTITY_URL, '/api/v1/tenants', token),

  // Platform Management
  tenants: (token, status, q, page = 1) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (q) params.set('q', q)
    params.set('page', page)
    return get(PLATFORM_URL, `/api/v1/tenants?${params}`, token)
  },
  tenant: (token, id) => get(PLATFORM_URL, `/api/v1/tenants/${id}`, token),
  createTenant: (token, data) => send(PLATFORM_URL, '/api/v1/tenants', token, 'POST', data),
  updateTenant: (token, id, data) => send(PLATFORM_URL, `/api/v1/tenants/${id}`, token, 'PATCH', data),
  transitionTenant: (token, id, action) =>
    send(PLATFORM_URL, `/api/v1/tenants/${id}/${action}`, token, 'POST'),
  subscription: (token, tenantId) =>
    get(PLATFORM_URL, `/api/v1/tenants/${tenantId}/subscription`, token),
  saveSubscription: (token, tenantId, data) =>
    send(PLATFORM_URL, `/api/v1/tenants/${tenantId}/subscription`, token, 'PUT', data),
  plans: (token) => get(PLATFORM_URL, '/api/v1/plans', token),
  createPlan: (token, data) => send(PLATFORM_URL, '/api/v1/plans', token, 'POST', data),
  updatePlan: (token, id, data) => send(PLATFORM_URL, `/api/v1/plans/${id}`, token, 'PATCH', data),
  featureFlags: (token) => get(PLATFORM_URL, '/api/v1/feature-flags', token),
  saveFeatureFlag: (token, data) => send(PLATFORM_URL, '/api/v1/feature-flags', token, 'PUT', data),
  metricsSummary: (token) => get(PLATFORM_URL, '/api/v1/metrics/summary', token),
  incomeReport: (token) => get(PLATFORM_URL, '/api/v1/reports/income', token),
}
