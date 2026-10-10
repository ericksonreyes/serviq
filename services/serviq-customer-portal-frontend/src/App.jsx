import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Landing from './pages/Landing'

// Tenant-scoped routes: /quickrepairguys resolves the tenant by slug.
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
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route path="/signup" element={token ? <Navigate to="/" /> : <Signup />} />
      <Route path="/" element={token ? <Home /> : <Landing />} />
      <Route path="/provider/:slug/login" element={token ? <Navigate to="/" /> : <TenantLogin />} />
      <Route path="/provider/:slug/signup" element={token ? <Navigate to="/" /> : <TenantSignup />} />
      <Route path="/provider/:slug" element={<Navigate to="login" replace />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
