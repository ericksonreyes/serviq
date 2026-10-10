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
    err.fields = json.errors || null
    throw err
  }
  return json
}

export const api = {
  login: (creds) => request(IDENTITY_URL, '/api/v1/auth/login', { method: 'POST', body: creds }),
  register: (creds) => request(IDENTITY_URL, '/api/v1/auth/register', { method: 'POST', body: creds }),
  requests: (token) => request(API_URL, '/api/v1/me/requests', { token }),
  jobs: (token) => request(API_URL, '/api/v1/me/jobs', { token }),
}
