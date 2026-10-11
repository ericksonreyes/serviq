const API_URL = import.meta.env.VITE_API_BASE_URL
const IDENTITY_URL = import.meta.env.VITE_IDENTITY_API_URL

async function request(base, path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
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
  register: (creds) => request(IDENTITY_URL, '/api/v1/auth/register', { method: 'POST', body: creds }),
  invitation: (token) => request(IDENTITY_URL, `/api/v1/invitations/${token}`),
  acceptInvite: (token, body) =>
    request(IDENTITY_URL, `/api/v1/invitations/${token}/accept`, { method: 'POST', body }),

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
