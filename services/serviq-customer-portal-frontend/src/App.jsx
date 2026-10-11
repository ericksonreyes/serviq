import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Catalog from './pages/Catalog'
import Book from './pages/Book'
import RequestDetail from './pages/RequestDetail'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'

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
      <Route path="/provider/:slug/login" element={token ? <Navigate to="/" /> : <TenantLogin />} />
      <Route path="/provider/:slug/signup" element={token ? <Navigate to="/" /> : <TenantSignup />} />
      <Route path="/provider/:slug" element={<Navigate to="login" replace />} />
      {token ? (
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/book" element={<Book />} />
          <Route path="/book/:serviceId" element={<Book />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      ) : (
        <>
          <Route path="/" element={<Landing />} />
          <Route path="*" element={<Navigate to="/" />} />
        </>
      )}
    </Routes>
  )
}
