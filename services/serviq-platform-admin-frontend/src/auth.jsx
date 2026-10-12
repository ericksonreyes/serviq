import { createContext, useContext, useEffect, useState } from 'react'
import { setUnauthorizedHandler } from './api'

const AuthCtx = createContext(null)

const TOKEN_KEY = 'serviq.token'
const REFRESH_KEY = 'serviq.refresh'
const IDENTITY_URL = import.meta.env.VITE_IDENTITY_API_URL

const decode = (t) => {
  try {
    return JSON.parse(atob(t.split('.')[1]))
  } catch {
    return null
  }
}

const storedRefresh = () => localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY)

// Access token: localStorage when "Keep me signed in" was checked,
// sessionStorage otherwise. The refresh token shares the same store —
// it is what survives past the access token's 1h exp.
function storedToken() {
  for (const store of [localStorage, sessionStorage]) {
    const t = store.getItem(TOKEN_KEY)
    if (!t) continue
    const claims = decode(t)
    if (claims?.exp && claims.exp * 1000 > Date.now()) return t
    store.removeItem(TOKEN_KEY)
  }
  return null
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(storedToken)
  const [refreshToken, setRefreshTokenState] = useState(storedRefresh)
  const claims = token ? decode(token) : null

  const setToken = (t, remember = false, refresh = null) => {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem(TOKEN_KEY)
      store.removeItem(REFRESH_KEY)
    }
    if (t) {
      const store = remember ? localStorage : sessionStorage
      store.setItem(TOKEN_KEY, t)
      if (refresh) store.setItem(REFRESH_KEY, refresh)
    }
    setTokenState(t)
    setRefreshTokenState(refresh)
  }

  // Silent rotation: swap the stored refresh token for a fresh pair.
  // Returns the new access token, or null (session dead → setToken(null)
  // already bounced the UI to login).
  const refreshSession = async () => {
    const raw = storedRefresh()
    if (!raw) return null
    const remember = !!localStorage.getItem(REFRESH_KEY)
    try {
      const res = await fetch(`${IDENTITY_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: raw }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToken(null)
        return null
      }
      setToken(json.access_token, remember, json.refresh_token)
      return json.access_token
    } catch {
      return null
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(refreshSession)
    // Returning session: access token expired but a refresh token exists —
    // rotate immediately so "keep me signed in" actually means it.
    if (!token && storedRefresh()) refreshSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthCtx.Provider value={{ token, claims, refreshToken, setToken, refreshSession }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
