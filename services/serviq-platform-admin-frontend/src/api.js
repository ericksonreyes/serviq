const IDENTITY_URL = import.meta.env.VITE_IDENTITY_API_URL
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_API_URL

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
  me: (token) => request(IDENTITY_URL, '/api/v1/auth/me', { token }),
  iamTenants: (token) => request(IDENTITY_URL, '/api/v1/tenants', { token }),
  tenants: (token) => request(PLATFORM_URL, '/api/v1/tenants', { token }),
}
