const API_URL = import.meta.env.VITE_API_BASE_URL
const IDENTITY_URL = import.meta.env.VITE_IDENTITY_API_URL

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
    err.status = res.status
    err.fields = json.errors || null
    throw err
  }
  return json
}

// Multipart evidence — the browser sets the multipart boundary itself.
async function upload(token, path, formData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || json.error || `Upload failed (${res.status})`)
  return json
}

export const api = {
  login: (creds) => request(IDENTITY_URL, '/api/v1/auth/login', { method: 'POST', body: creds }),
  logout: (token, refreshToken) =>
    request(IDENTITY_URL, '/api/v1/auth/logout', { method: 'POST', token, body: { refresh_token: refreshToken } }),
  register: (creds) => request(IDENTITY_URL, '/api/v1/auth/register', { method: 'POST', body: creds }),
  invitation: (token) => request(IDENTITY_URL, `/api/v1/invitations/${token}`),
  acceptInvite: (token, body) =>
    request(IDENTITY_URL, `/api/v1/invitations/${token}/accept`, { method: 'POST', body }),

  agentHome: (token, agentId) => request(API_URL, `/api/v1/agents/${agentId}/home`, { token }),
  myJobs: (token, page = 1) => request(API_URL, `/api/v1/me/jobs?page=${page}`, { token }),
  myJob: (token, id) => request(API_URL, `/api/v1/me/jobs/${id}`, { token }),

  acceptAssignment: (token, id) =>
    request(API_URL, `/api/v1/assignments/${id}/accept`, { token, method: 'POST' }),
  rejectAssignment: (token, id) =>
    request(API_URL, `/api/v1/assignments/${id}/reject`, { token, method: 'POST' }),

  openJobs: (token) => request(API_URL, '/api/v1/me/open-jobs', { token }),
  claimJob: (token, jobId) =>
    request(API_URL, `/api/v1/jobs/${jobId}/claim`, { token, method: 'POST' }),

  checkIn: (token, id) =>
    request(API_URL, `/api/v1/executions/${id}/check-in`, { token, method: 'POST' }),
  completeExecution: (token, id) =>
    request(API_URL, `/api/v1/executions/${id}/complete`, { token, method: 'POST' }),
  stepAction: (token, id, position, action) =>
    request(API_URL, `/api/v1/executions/${id}/steps/${position}/${action}`, { token, method: 'POST' }),

  listEvidence: (token, id) => request(API_URL, `/api/v1/executions/${id}/evidence`, { token }),
  postEvidence: (token, id, payload) =>
    request(API_URL, `/api/v1/executions/${id}/evidence`, { token, method: 'POST', body: payload }),
  uploadEvidenceFile: (token, id, { file, kind = 'photo', step_position } = {}) => {
    const form = new FormData()
    form.append('kind', kind)
    if (step_position !== undefined && step_position !== null) form.append('step_position', step_position)
    form.append('file', file)
    return upload(token, `/api/v1/executions/${id}/evidence`, form)
  },

  submitPaymentEvidence: (token, payload) =>
    request(API_URL, '/api/v1/payment-evidence', { token, method: 'POST', body: payload }),

  jobInvoice: (token, id) => request(API_URL, `/api/v1/executions/${id}/invoice`, { token }),
  collectCash: (token, id) =>
    request(API_URL, `/api/v1/executions/${id}/cash-collected`, { token, method: 'POST' }),

  expectedRemittance: (token) => request(API_URL, '/api/v1/remittances/expected', { token }),
  depositRemittance: (token, payload) =>
    request(API_URL, '/api/v1/remittances/deposits', { token, method: 'POST', body: payload }),
  turnIn: (token, payload) =>
    request(API_URL, '/api/v1/remittances/turn-ins', { token, method: 'POST', body: payload }),
}
