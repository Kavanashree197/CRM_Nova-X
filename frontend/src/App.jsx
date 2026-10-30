import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import TeamLeadDashboard from './pages/TeamLeadDashboard'
import MyCases from './pages/MyCases'
import AllCases from './pages/AllCases'
import CreateCase from './pages/CreateCase'
import ActivityLogs from './pages/ActivityLogs'
import AuditHistory from './pages/AuditHistory'
import ProductivityReports from './pages/ProductivityReports'
import TeamPerformance from './pages/TeamPerformance'
import TrustFairness from './pages/TrustFairness'
import Settings from './pages/Settings'

function RequireAuth({ children }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />
  return <Layout>{children}</Layout>
}

function RequireRole({ roles, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

// Role-based dashboard router: Admin -> org-wide Overview, Team Lead ->
// team-focused TeamLeadDashboard, Resource -> personal Overview.
function DashboardRouter() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'Team Lead') return <Layout><TeamLeadDashboard /></Layout>
  return <Layout><Overview /></Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"             element={<DashboardRouter />} />
      <Route path="/my-cases"     element={<RequireRole roles={['Resource']}><MyCases /></RequireRole>} />
      <Route path="/all-cases"    element={<RequireAuth><AllCases /></RequireAuth>} />
      <Route path="/create-case"  element={<RequireRole roles={['Resource']}><CreateCase /></RequireRole>} />
      <Route path="/activity-logs" element={<RequireAuth><ActivityLogs /></RequireAuth>} />
      <Route path="/audit"        element={<RequireAuth><AuditHistory /></RequireAuth>} />
      <Route path="/reports"      element={<RequireAuth><ProductivityReports /></RequireAuth>} />
      <Route path="/team"         element={<RequireRole roles={['Admin','Team Lead']}><TeamPerformance /></RequireRole>} />
      <Route path="/trust"        element={<RequireAuth><TrustFairness /></RequireAuth>} />
      <Route path="/settings"     element={<RequireRole roles={['Admin']}><Settings /></RequireRole>} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  )
}
