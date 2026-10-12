import { useState } from 'react'
import { Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tenants from './pages/Tenants'
import TenantDetail from './pages/TenantDetail'
import Plans from './pages/Plans'
import FeatureFlags from './pages/FeatureFlags'
import Users from './pages/Users'
import Income from './pages/Income'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/providers', label: 'Service Providers' },
  { to: '/plans', label: 'Plans & Subscriptions' },
  { to: '/feature-flags', label: 'Feature Flags' },
  { to: '/users', label: 'Users & Roles' },
  { to: '/income', label: 'Income & Settlement' },
]

function LegacyTenantDetail() {
  const { id } = useParams()
  return <Navigate to={`/providers/${id}`} replace />
}

function Layout() {
  const { token, refreshToken, setToken, claims } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  return (
    <div className="flex min-h-screen bg-violet-50">
      {/* Mobile top bar — the sidebar is a drawer below md. */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 bg-indigo-950 px-4 py-3 text-white md:hidden">
        <button aria-label="Open menu" onClick={() => setNavOpen(true)} className="rounded p-1 text-2xl leading-none hover:bg-indigo-900">
          ☰
        </button>
        <NavLink to="/" className="font-display text-2xl">ServIQ</NavLink>
        <span className="text-sm text-slate-400">Platform Admin</span>
      </div>
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" onClick={() => setNavOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-indigo-950 text-white transition-transform md:static md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5">
          <NavLink to="/" className="font-display text-3xl">ServIQ</NavLink>
          <div className="text-xs text-slate-400">Platform Admin</div>
        </div>
        <nav className="flex-1 space-y-1 px-3" onClick={() => setNavOpen(false)}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-violet-700 text-white' : 'text-slate-300 hover:bg-indigo-900 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-indigo-900 px-5 py-4">
          <div className="truncate text-xs text-slate-400">{claims?.display_name || claims?.username || ''}</div>
          <button
            onClick={() => {
              api.logout(token, refreshToken).catch(() => {})
              setToken(null)
            }}
            className="mt-1 text-sm text-slate-300 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pt-16 sm:p-6 md:pt-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/providers" element={<Tenants />} />
          <Route path="/providers/:id" element={<TenantDetail />} />
          {/* Legacy paths — old /tenants bookmarks land on /providers. */}
          <Route path="/tenants" element={<Navigate to="/providers" replace />} />
          <Route path="/tenants/:id" element={<LegacyTenantDetail />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/feature-flags" element={<FeatureFlags />} />
          <Route path="/users" element={<Users />} />
          <Route path="/income" element={<Income />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { token } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route path="/*" element={token ? <Layout /> : <Navigate to="/login" />} />
    </Routes>
  )
}
