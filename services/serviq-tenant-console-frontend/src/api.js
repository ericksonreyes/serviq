// Service base URLs — browser-facing admin APIs (VITE_* are localhost
// host ports; see .env.example and INTERNAL_SERVICE_SECURITY.MD).
export const BASES = {
  identity: import.meta.env.VITE_IDENTITY_API_URL || 'http://localhost:8010',
  platform: import.meta.env.VITE_PLATFORM_API_URL || 'http://localhost:8011',
  service: import.meta.env.VITE_SERVICE_API_URL || 'http://localhost:8012',
  crm: import.meta.env.VITE_CRM_API_URL || 'http://localhost:8013',
  job: import.meta.env.VITE_JOB_API_URL || 'http://localhost:8014',
  workforce: import.meta.env.VITE_WORKFORCE_API_URL || 'http://localhost:8015',
  dispatch: import.meta.env.VITE_DISPATCH_API_URL || 'http://localhost:8016',
  field: import.meta.env.VITE_FIELD_API_URL || 'http://localhost:8017',
  support: import.meta.env.VITE_SUPPORT_API_URL || 'http://localhost:8018',
  notification: import.meta.env.VITE_NOTIFICATION_API_URL || 'http://localhost:8019',
  billing: import.meta.env.VITE_BILLING_API_URL || 'http://localhost:8020',
  payouts: import.meta.env.VITE_PAYOUTS_API_URL || 'http://localhost:8021',
  ai: import.meta.env.VITE_AI_AGENT_API_URL || 'http://localhost:8100',
}

// Tenant-scoped API path — every domain call carries the JWT's tenant_id.
export const tp = (tenant, path) => `/api/v1/tenants/${tenant}${path}`

async function request(base, path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(form ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(form ? { body: form } : body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json.message || json.error || `Request failed (${res.status})`)
    err.fields = json.errors || null
    err.status = res.status
    throw err
  }
  return json
}

// Paginated Laravel responses and {'data': [...]} envelopes both appear;
// normalize to an array for list rendering.
export const rows = (json) => json?.data ?? json ?? []

export const api = {
  login: (creds) => request(BASES.identity, '/api/v1/auth/login', { method: 'POST', body: creds }),
  me: (token) => request(BASES.identity, '/api/v1/auth/me', { token }),
  signup: (body) => request(BASES.platform, '/api/v1/tenants/signup', { method: 'POST', body }),

  // IAM — tenant staff and role assignment (scope = tenant_id).
  users: (token, t) => request(BASES.identity, `/api/v1/users?scope=${t}`, { token }),
  createUser: (token, body) => request(BASES.identity, '/api/v1/users', { token, method: 'POST', body }),
  updateUser: (token, id, body) => request(BASES.identity, `/api/v1/users/${id}`, { token, method: 'PATCH', body }),
  assignRoles: (token, id, roles) => request(BASES.identity, `/api/v1/users/${id}/roles`, { token, method: 'POST', body: { roles } }),
  roles: (token, t) => request(BASES.identity, `/api/v1/roles?scope=${t}`, { token }),
  inviteUser: (token, t, body) =>
    request(BASES.identity, tp(t, '/invitations'), { token, method: 'POST', body }),

  // Workforce — service agents.
  agents: (token, t) => request(BASES.workforce, tp(t, '/agents'), { token }),
  eligibleAgents: (token, t, q = '') => request(BASES.workforce, tp(t, `/agents/eligible${q}`), { token }),
  createAgent: (token, body) => request(BASES.workforce, '/api/v1/agents', { token, method: 'POST', body }),
  updateAgent: (token, t, id, body) => request(BASES.workforce, tp(t, `/agents/${id}`), { token, method: 'PATCH', body }),

  // Service catalog, pricing, service areas, tenant settings.
  services: (token, t) => request(BASES.service, tp(t, '/services'), { token }),
  createService: (token, body) => request(BASES.service, '/api/v1/services', { token, method: 'POST', body }),
  updateService: (token, t, id, body) => request(BASES.service, tp(t, `/services/${id}`), { token, method: 'PATCH', body }),
  setServiceSteps: (token, t, id, steps) => request(BASES.service, tp(t, `/services/${id}/steps`), { token, method: 'PUT', body: { steps } }),
  servicePricing: (token, t, id) => request(BASES.service, tp(t, `/services/${id}/pricing`), { token }),
  setServicePricing: (token, t, id, body) => request(BASES.service, tp(t, `/services/${id}/pricing`), { token, method: 'PUT', body }),
  serviceAreas: (token, t) => request(BASES.service, tp(t, '/service-areas'), { token }),
  createServiceArea: (token, t, body) => request(BASES.service, tp(t, '/service-areas'), { token, method: 'POST', body }),
  updateServiceArea: (token, t, id, body) => request(BASES.service, tp(t, `/service-areas/${id}`), { token, method: 'PATCH', body }),
  deleteServiceArea: (token, t, id) => request(BASES.service, tp(t, `/service-areas/${id}`), { token, method: 'DELETE' }),
  settings: (token, t) => request(BASES.service, tp(t, '/settings'), { token }),
  saveSettings: (token, t, body) => request(BASES.service, tp(t, '/settings'), { token, method: 'PUT', body }),
  repairGuides: (token, t, q = '') => request(BASES.service, tp(t, `/repair-guides?q=${encodeURIComponent(q)}`), { token }),

  // Customers & service requests.
  customers: (token, t) => request(BASES.crm, tp(t, '/customers'), { token }),
  createCustomer: (token, body) => request(BASES.crm, '/api/v1/customers', { token, method: 'POST', body }),
  customerAddresses: (token, t, c) => request(BASES.crm, tp(t, `/customers/${c}/addresses`), { token }),
  requests: (token, t, status = '') => request(BASES.crm, tp(t, `/requests${status ? `?status=${status}` : ''}`), { token }),
  request: (token, t, id) => request(BASES.crm, tp(t, `/requests/${id}`), { token }),
  cancelRequest: (token, t, id) => request(BASES.crm, tp(t, `/requests/${id}/cancel`), { token, method: 'POST' }),
  convertRequest: (token, t, id) => request(BASES.crm, tp(t, `/requests/${id}/convert`), { token, method: 'POST' }),

  // Jobs & dispatch.
  jobs: (token, t) => request(BASES.job, tp(t, '/jobs'), { token }),
  job: (token, t, id) => request(BASES.job, tp(t, `/jobs/${id}`), { token }),
  assignJob: (token, t, id, agent_id) => request(BASES.job, tp(t, `/jobs/${id}/assign`), { token, method: 'POST', body: { agent_id } }),
  cancelJob: (token, t, id) => request(BASES.job, tp(t, `/jobs/${id}/cancel`), { token, method: 'POST' }),
  rescheduleJob: (token, t, id, scheduled_for) => request(BASES.job, tp(t, `/jobs/${id}/reschedule`), { token, method: 'POST', body: { scheduled_for } }),
  dispatchQueue: (token, t) => request(BASES.dispatch, tp(t, '/dispatch/queue'), { token }),
  dispatchAssign: (token, t, body) => request(BASES.dispatch, tp(t, '/dispatch/assign'), { token, method: 'POST', body }),
  dispatchBroadcast: (token, t, body) => request(BASES.dispatch, tp(t, '/dispatch/broadcast'), { token, method: 'POST', body }),
  dispatchRecommend: (token, t, job_id) => request(BASES.dispatch, tp(t, `/dispatch/recommend?job_id=${job_id}`), { token }),
  assignments: (token, t, q = '') => request(BASES.dispatch, tp(t, `/assignments${q}`), { token }),
  executions: (token, t) => request(BASES.field, tp(t, '/executions'), { token }),
  execution: (token, t, id) => request(BASES.field, tp(t, `/executions/${id}`), { token }),

  // Billing — invoices, payment evidence, remittances, refunds.
  invoices: (token, t, status = '') => request(BASES.billing, tp(t, `/invoices${status ? `?status=${status}` : ''}`), { token }),
  invoice: (token, t, id) => request(BASES.billing, tp(t, `/invoices/${id}`), { token }),
  paymentEvidence: (token, t, q = '') => request(BASES.billing, tp(t, `/payment-evidence${q}`), { token }),
  reviewEvidence: (token, t, id, body) => request(BASES.billing, tp(t, `/payment-evidence/${id}/review`), { token, method: 'POST', body }),
  remittances: (token, t) => request(BASES.billing, tp(t, '/remittances'), { token }),
  expectedRemittance: (token, t, agent_id) => request(BASES.billing, tp(t, `/remittances/expected?agent_id=${agent_id}`), { token }),
  submitTurnIn: (token, t, body) => request(BASES.billing, tp(t, '/remittances/turn-ins'), { token, method: 'POST', body }),
  submitBatch: (token, t, body) => request(BASES.billing, tp(t, '/remittances/batches'), { token, method: 'POST', body }),
  markDigital: (token, t, invoice_ids) => request(BASES.billing, tp(t, '/remittances/digital'), { token, method: 'POST', body: { invoice_ids } }),
  confirmRemittance: (token, t, id, body) => request(BASES.billing, tp(t, `/remittances/${id}/confirm`), { token, method: 'POST', body }),
  refundRequests: (token, t) => request(BASES.billing, tp(t, '/refund-requests'), { token }),
  executeRefund: (token, t, id) => request(BASES.billing, tp(t, `/refund-requests/${id}/execute`), { token, method: 'POST' }),
  payouts: (token, t) => request(BASES.payouts, tp(t, '/payouts'), { token }),

  // Customer Support — cases, notes, status, refund decisions.
  cases: (token, t, status = '') => request(BASES.support, tp(t, `/cases${status ? `?status=${status}` : ''}`), { token }),
  caseDetail: (token, t, id) => request(BASES.support, tp(t, `/cases/${id}`), { token }),
  addCaseNote: (token, t, id, body) => request(BASES.support, tp(t, `/cases/${id}/notes`), { token, method: 'POST', body: { body } }),
  setCaseStatus: (token, t, id, status) => request(BASES.support, tp(t, `/cases/${id}/status`), { token, method: 'POST', body: { status } }),
  refundDecision: (token, t, id, body) => request(BASES.support, tp(t, `/cases/${id}/refund-decision`), { token, method: 'POST', body }),
  refundDecisions: (token, t) => request(BASES.support, tp(t, '/refund-decisions'), { token }),

  // AI agent — profile-scoped chat (dispatcher command box, support chat).
  chat: (token, profile, message, context = {}) =>
    request(BASES.ai, '/api/v1/chat', { token, method: 'POST', body: { profile, message, context } }),
}
