import { createContext, useContext, useState } from 'react'

const AuthCtx = createContext(null)

// Access token lives in memory only (frontend skill convention) — a page
// refresh returns to login until refresh-token handling is specced.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const claims = token ? JSON.parse(atob(token.split('.')[1])) : null
  return (
    <AuthCtx.Provider value={{ token, claims, setToken }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)

// JWT claims carry tenant_id + role names (see api-security skill).
export const useTenant = () => useAuth()?.claims?.tenant_id
export const useRoles = () => useAuth()?.claims?.roles ?? []
