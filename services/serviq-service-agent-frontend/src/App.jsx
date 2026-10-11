import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import TurnIn from './pages/TurnIn'

// Tenant-scoped routes: /provider/<slug> resolves the tenant by slug.
function TenantLogin() {
  const { slug } = useParams()
  return <Login tenantSlug={slug} />
}
function TenantSignup() {
  const { slug } = useParams()
  return <Signup tenantSlug={slug} />
}

export default function App() {
  const { token } = useAuth()
  const authed = (el) => (token ? el : <Navigate to="/login" />)
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route path="/signup" element={token ? <Navigate to="/" /> : <Signup />} />
      <Route path="/" element={authed(<Home />)} />
      <Route path="/jobs" element={authed(<Jobs />)} />
      <Route path="/jobs/:id" element={authed(<JobDetail />)} />
      <Route path="/turn-in" element={authed(<TurnIn />)} />
      <Route path="/provider/:slug/login" element={token ? <Navigate to="/" /> : <TenantLogin />} />
      <Route path="/provider/:slug/signup" element={token ? <Navigate to="/" /> : <TenantSignup />} />
      <Route path="/provider/:slug" element={<Navigate to="login" replace />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
