import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api, rows } from '../api'
import { useAuth, useRoles, useTenant } from '../auth'

const ADMIN = 'Tenant Administrator'
const DISPATCHER = 'Dispatcher'
const SUPPORT = 'Customer Support'

// Role-scoped nav: admins see administration + finance, dispatchers the
// dispatch floor, support the case desk. Several roles show several
// sections; a user with none of the canonical roles sees everything so a
// custom role isn't locked out.
const NAV = [
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
      { to: '/admin/customers', label: 'Customers' },
      { to: '/support/refunds', label: 'Refunds & revenue' },
    ],
  },
  {
    section: 'Administration',
    roles: [ADMIN],
    items: [
      { to: '/admin/users', label: 'Users & roles' },
      { to: '/admin/agents', label: 'Service agents' },
      { to: '/admin/services', label: 'Service catalog' },
      { to: '/admin/areas', label: 'Service areas' },
      { to: '/admin/settings', label: 'Business settings' },
      { to: '/admin/finance', label: 'Revenue & payouts' },
    ],
  },
]

export default function Layout() {
  const { claims, token, refreshToken, setToken } = useAuth()
  const roles = useRoles()
  const tenant = useTenant()
  const navigate = useNavigate()

  // Unread badge on the nav — polls the notification feed so demand
  // signals (e.g. coverage interest) surface without opening the page.
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      api.notifications(token, tenant, true)
        .then((j) => { if (!cancelled) setUnread(rows(j).length) })
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [token, tenant])

  const visible = NAV.map((s) => ({
    ...s,
    show: s.roles.some((r) => roles.includes(r)),
  }))
  if (!visible.some((s) => s.show)) visible.forEach((s) => (s.show = true))

  const signOut = () => {
    api.logout(token, refreshToken).catch(() => {})
    setToken(null)
    navigate('/login')
  }

  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-violet-50">
      {/* Mobile top bar — the sidebar is a drawer below md. */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 bg-indigo-950 px-4 py-3 text-white md:hidden">
        <button aria-label="Open menu" onClick={() => setNavOpen(true)} className="rounded p-1 text-2xl leading-none hover:bg-indigo-900">
          ☰
        </button>
        <NavLink to="/" className="font-display text-2xl">ServIQ</NavLink>
        <span className="text-sm text-slate-400">Provider Console</span>
      </div>
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" onClick={() => setNavOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col bg-indigo-950 text-slate-300 transition-transform md:static md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4">
          <NavLink to="/" className="font-display text-3xl text-white">ServIQ</NavLink>
          <p className="text-xs text-slate-400">Provider Console</p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4" onClick={() => setNavOpen(false)}>
          <NavLink to="/" end className={navClass}>Overview</NavLink>
          <NavLink to="/notifications" className={navClass}>
            Notifications
            {unread > 0 && (
              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
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
        <div className="border-t border-indigo-900 px-4 py-3 text-xs">
          <p className="truncate text-slate-300">{claims?.display_name || claims?.username}</p>
          <p className="truncate text-slate-500">{(roles || []).join(', ') || 'no roles'}</p>
          <button onClick={signOut} className="mt-2 text-slate-400 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pt-16 sm:p-6 md:pt-6">
        <Outlet />
      </main>
    </div>
  )
}

const navClass = ({ isActive }) =>
  `block rounded-lg px-2 py-1.5 text-sm ${isActive ? 'bg-violet-700 font-medium text-white' : 'text-slate-300 hover:bg-indigo-900'}`
