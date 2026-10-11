import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tenants from './pages/Tenants'
import TenantDetail from './pages/TenantDetail'
import Plans from './pages/Plans'
import FeatureFlags from './pages/FeatureFlags'
import Settings from './pages/Settings'
import Users from './pages/Users'
import Income from './pages/Income'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/tenants', label: 'Tenants' },
  { to: '/plans', label: 'Plans & Subscriptions' },
  { to: '/feature-flags', label: 'Feature Flags' },
  { to: '/users', label: 'Users & Roles' },
  { to: '/settings', label: 'Settings & Policies' },
  { to: '/income', label: 'Income & Settlement' },
]

function Layout() {
  const { setToken, claims } = useAuth()
  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-white">
        <div className="px-5 py-5">
          <div className="text-lg font-semibold">ServIQ</div>
          <div className="text-xs text-slate-400">Platform Admin</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-teal-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4">
          <div className="truncate text-xs text-slate-400">{claims?.sub ?? ''}</div>
          <button onClick={() => setToken(null)} className="mt-1 text-sm text-slate-300 hover:text-white">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/tenants/:id" element={<TenantDetail />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/feature-flags" element={<FeatureFlags />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
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
