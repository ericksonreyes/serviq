import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, useRoles } from '../auth'

const ADMIN = 'Tenant Administrator'
const DISPATCHER = 'Dispatcher'
const SUPPORT = 'Customer Support'

// Role-scoped nav: admins see administration + finance, dispatchers the
// dispatch floor, support the case desk. Several roles show several
// sections; a user with none of the canonical roles sees everything so a
// custom role isn't locked out.
const NAV = [
  {
    section: 'Administration',
    roles: [ADMIN],
    items: [
      { to: '/admin/users', label: 'Users & roles' },
      { to: '/admin/agents', label: 'Service agents' },
      { to: '/admin/customers', label: 'Customers' },
      { to: '/admin/services', label: 'Service catalog' },
      { to: '/admin/areas', label: 'Service areas' },
      { to: '/admin/settings', label: 'Business settings' },
      { to: '/admin/finance', label: 'Revenue & payouts' },
    ],
  },
  {
    section: 'Dispatch',
    roles: [DISPATCHER, ADMIN],
    items: [
      { to: '/dispatch', label: 'Queue & command' },
      { to: '/dispatch/requests', label: 'Service requests' },
      { to: '/dispatch/jobs', label: 'Jobs' },
      { to: '/dispatch/remittances', label: 'Remittances' },
      { to: '/dispatch/evidence', label: 'Payment evidence' },
    ],
  },
  {
    section: 'Support',
    roles: [SUPPORT, ADMIN],
    items: [
      { to: '/support/cases', label: 'Cases' },
      { to: '/support/refunds', label: 'Refunds & revenue' },
    ],
  },
]

export default function Layout() {
  const { claims, setToken } = useAuth()
  const roles = useRoles()
  const navigate = useNavigate()

  const visible = NAV.map((s) => ({
    ...s,
    show: s.roles.some((r) => roles.includes(r)),
  }))
  if (!visible.some((s) => s.show)) visible.forEach((s) => (s.show = true))

  const signOut = () => {
    setToken(null)
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
        <div className="px-5 py-4">
          <NavLink to="/" className="text-lg font-semibold text-white">ServIQ</NavLink>
          <p className="text-xs text-slate-400">Tenant Console</p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          <NavLink to="/" end className={navClass}>Overview</NavLink>
          {visible.filter((s) => s.show).map((s) => (
            <div key={s.section}>
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.section}</p>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/dispatch'} className={navClass}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-700 px-4 py-3 text-xs">
          <p className="truncate text-slate-300">{claims?.sub}</p>
          <p className="truncate text-slate-500">{(roles || []).join(', ') || 'no roles'}</p>
          <button onClick={signOut} className="mt-2 text-slate-400 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}

const navClass = ({ isActive }) =>
  `block rounded-lg px-2 py-1.5 text-sm ${isActive ? 'bg-teal-700 font-medium text-white' : 'text-slate-300 hover:bg-slate-800'}`
