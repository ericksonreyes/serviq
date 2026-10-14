import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Notifications from './pages/Notifications'
import Users from './pages/admin/Users'
import Agents from './pages/admin/Agents'
import Customers from './pages/admin/Customers'
import Services from './pages/admin/Services'
import ServiceDetail from './pages/admin/ServiceDetail'
import Areas from './pages/admin/Areas'
import Settings from './pages/admin/Settings'
import Finance from './pages/admin/Finance'
import DispatchDashboard from './pages/dispatch/Dashboard'
import Requests from './pages/dispatch/Requests'
import RequestDetail from './pages/dispatch/RequestDetail'
import Jobs from './pages/dispatch/Jobs'
import JobDetail from './pages/dispatch/JobDetail'
import Remittances from './pages/dispatch/Remittances'
import RemittanceTurnIn from './pages/dispatch/RemittanceTurnIn'
import RemittanceDigital from './pages/dispatch/RemittanceDigital'
import RemittanceDeposit from './pages/dispatch/RemittanceDeposit'
import Evidence from './pages/dispatch/Evidence'
import Cases from './pages/support/Cases'
import CaseDetail from './pages/support/CaseDetail'
import Refunds from './pages/support/Refunds'

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
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
      <Route path="/signup" element={token ? <Navigate to="/" /> : <Signup />} />
      <Route path="/provider/:slug/login" element={token ? <Navigate to="/" /> : <TenantLogin />} />
      <Route path="/provider/:slug/signup" element={token ? <Navigate to="/" /> : <TenantSignup />} />
      <Route path="/provider/:slug" element={<Navigate to="login" replace />} />
      <Route element={token ? <Layout /> : <Navigate to="/login" />}>
        <Route path="/" element={<Home />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/admin/users" element={<Users />} />
        <Route path="/admin/agents" element={<Agents />} />
        <Route path="/admin/customers" element={<Customers />} />
        <Route path="/admin/services" element={<Services />} />
        <Route path="/admin/services/:serviceId" element={<ServiceDetail />} />
        <Route path="/admin/areas" element={<Areas />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin/finance" element={<Finance />} />
        <Route path="/dispatch" element={<DispatchDashboard />} />
        <Route path="/dispatch/requests" element={<Requests />} />
        <Route path="/dispatch/requests/:requestId" element={<RequestDetail />} />
        <Route path="/dispatch/jobs" element={<Jobs />} />
        <Route path="/dispatch/jobs/:jobId" element={<JobDetail />} />
        <Route path="/dispatch/remittances" element={<Remittances />} />
        <Route path="/dispatch/remittances/turn-in" element={<RemittanceTurnIn />} />
        <Route path="/dispatch/remittances/digital" element={<RemittanceDigital />} />
        <Route path="/dispatch/remittances/deposit-batch" element={<RemittanceDeposit />} />
        <Route path="/dispatch/evidence" element={<Evidence />} />
        <Route path="/support/cases" element={<Cases />} />
        <Route path="/support/cases/:caseId" element={<CaseDetail />} />
        <Route path="/support/refunds" element={<Refunds />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
