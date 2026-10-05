// Thin fetch wrapper: JSON in/out, bearer token, automatic refresh on 401, readable errors.
export const ORIGIN = import.meta.env.VITE_API_ORIGIN || ''
const BASE = `${ORIGIN}/api`
const KEY = 'sts.session'

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
  },
  set(s) { localStorage.setItem(KEY, JSON.stringify(s)) },
  clear() { localStorage.removeItem(KEY) },
}

let onLogout = () => {}
export const setLogoutHandler = (fn) => { onLogout = fn }

// One refresh at a time: React StrictMode and parallel requests must not rotate the same token twice.
let refreshing = null
async function refreshSession() {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const attempt = async (token) => {
      const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }) })
      return r.ok ? r.json() : null
    }
    const before = session.get()
    if (!before?.refresh_token) return null
    let data = await attempt(before.refresh_token)
    if (!data) {
      // another browser tab may have just rotated the token: use whatever it stored
      const after = session.get()
      if (after?.refresh_token && after.refresh_token !== before.refresh_token) data = await attempt(after.refresh_token)
    }
    if (!data) return null
    const next = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user }
    session.set(next)
    return next
  })().finally(() => { refreshing = null })
  return refreshing
}

/** Returns a usable access token, refreshing first if it expires within 30 seconds. */
export async function freshToken() {
  const s = session.get()
  if (!s?.access_token) return null
  try {
    const { exp } = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (exp * 1000 - Date.now() > 30_000) return s.access_token
  } catch { /* fall through to refresh */ }
  return (await refreshSession())?.access_token || null
}

async function request(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const s = session.get()
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && s?.access_token) headers.Authorization = `Bearer ${s.access_token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  if (res.status === 401 && auth && retry && s?.refresh_token) {
    const next = await refreshSession()
    if (next) return request(path, { method, body, auth, retry: false })
    session.clear()
    onLogout()
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.details?.[0]
    const msg = detail ? `${detail.path ? detail.path + ': ' : ''}${detail.message}` : data?.error || `Request failed (${res.status})`
    throw new ApiError(res.status, msg, data?.details)
  }
  return data
}

export const api = {
  get: (p) => request(p),
  post: (p, body = {}) => request(p, { method: 'POST', body }),
  put: (p, body = {}) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  // public endpoints (login/register/activate)
  open: (p, body) => request(p, { method: 'POST', body, auth: false }),
}
