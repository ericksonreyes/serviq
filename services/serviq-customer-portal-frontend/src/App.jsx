import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import { api, setMaintenanceHandler } from './api'
import { useAuth } from './auth'
import Layout from './Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Landing from './pages/Landing'
import ProviderHome from './pages/ProviderHome'
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

function MaintenanceScreen() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        p: 3,
      }}
    >
      <Typography variant="h5" fontWeight={700}>We&rsquo;ll be right back</Typography>
      <Typography color="text.secondary" align="center" maxWidth={420}>
        The portal is temporarily unavailable while we make some improvements.
        Please try again soon.
      </Typography>
    </Box>
  )
}

export default function App() {
  const { token } = useAuth()
  // `customer-portal` flag = kill-switch. Fail-open everywhere: only a
  // definitively disabled flag shows the maintenance screen — fetch
  // errors, 404 (flag missing), and the pre-check window render the app.
  const [maintenance, setMaintenance] = useState(false)
  useEffect(() => {
    setMaintenanceHandler(() => setMaintenance(true))
    const check = () =>
      api
        .featureFlag('customer-portal')
        .then((r) => setMaintenance(r.data?.enabled === false))
        .catch(() => setMaintenance(false))
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])
  if (maintenance) return <MaintenanceScreen />
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route path="/signup" element={token ? <Navigate to="/" /> : <Signup />} />
      <Route path="/provider/:slug/login" element={token ? <Navigate to="/" /> : <TenantLogin />} />
      <Route path="/provider/:slug/signup" element={token ? <Navigate to="/" /> : <TenantSignup />} />
      <Route path="/provider/:slug" element={<ProviderHome />} />
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
