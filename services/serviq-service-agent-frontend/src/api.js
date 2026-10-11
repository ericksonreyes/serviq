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
  register: (creds) => request(IDENTITY_URL, '/api/v1/auth/register', { method: 'POST', body: creds }),
  invitation: (token) => request(IDENTITY_URL, `/api/v1/invitations/${token}`),
  acceptInvite: (token, body) =>
    request(IDENTITY_URL, `/api/v1/invitations/${token}/accept`, { method: 'POST', body }),

  agentHome: (token, agentId) => request(API_URL, `/api/v1/agents/${agentId}/home`, { token }),
  myJobs: (token) => request(API_URL, '/api/v1/me/jobs', { token }),
  myJob: (token, id) => request(API_URL, `/api/v1/me/jobs/${id}`, { token }),

  acceptAssignment: (token, id) =>
    request(API_URL, `/api/v1/assignments/${id}/accept`, { token, method: 'POST' }),
  rejectAssignment: (token, id) =>
    request(API_URL, `/api/v1/assignments/${id}/reject`, { token, method: 'POST' }),

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

  expectedRemittance: (token) => request(API_URL, '/api/v1/remittances/expected', { token }),
  turnIn: (token, payload) =>
    request(API_URL, '/api/v1/remittances/turn-ins', { token, method: 'POST', body: payload }),
}
