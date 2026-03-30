import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import FaviconUpdater from './components/FaviconUpdater'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Cabinet from './pages/Cabinet'
import AdminCabinet from './pages/AdminCabinet'
import PlanCreate from './pages/PlanCreate'
import PlanEdit from './pages/PlanEdit'
import TacticalBoard from './pages/TacticalBoard'
import PaymentCheckout from './pages/PaymentCheckout'
import PaymentReturn from './pages/PaymentReturn'

function PrivateRoute({ children, adminOnly, redirectAdminTo }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Загрузка...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !user.isAdmin) return <Navigate to="/cabinet" replace />
  if (redirectAdminTo && user.isAdmin) return <Navigate to={redirectAdminTo} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <FaviconUpdater />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/cabinet" element={
            <PrivateRoute redirectAdminTo="/admin"><Cabinet /></PrivateRoute>
          } />
          <Route path="/admin" element={
            <PrivateRoute adminOnly><AdminCabinet /></PrivateRoute>
          } />
          <Route path="/plan/new" element={
            <PrivateRoute><PlanCreate /></PrivateRoute>
          } />
          <Route path="/board" element={
            <PrivateRoute><TacticalBoard /></PrivateRoute>
          } />
          <Route path="/board/:id" element={
            <PrivateRoute><TacticalBoard /></PrivateRoute>
          } />
          <Route path="/plan/:id" element={
            <PrivateRoute><PlanEdit /></PrivateRoute>
          } />
          <Route path="/payment" element={
            <PrivateRoute><PaymentCheckout /></PrivateRoute>
          } />
          <Route path="/payment/return" element={
            <PrivateRoute><PaymentReturn /></PrivateRoute>
          } />
          <Route path="/payment/test" element={<Navigate to="/payment" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
