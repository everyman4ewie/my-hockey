import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import { AdminViewAsProvider, useAdminViewAs } from './context/AdminViewAsContext'
import { EditorPersonaProvider, useEditorPersona } from './context/EditorPersonaContext'
import FaviconUpdater from './components/FaviconUpdater'
import DeviceAnalyticsReporter from './components/DeviceAnalyticsReporter'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Cabinet from './pages/Cabinet'
import AdminCabinet from './pages/AdminCabinet'
import AdminLibraryList from './pages/AdminLibraryList'
import AdminLibraryFolderEdit from './pages/AdminLibraryFolderEdit'
import AdminLibraryEdit from './pages/AdminLibraryEdit'
import LibraryStaffLayout from './pages/LibraryStaffLayout'
import LibraryPage from './pages/LibraryPage'
import PlanCreate from './pages/PlanCreate'
import PlanEdit from './pages/PlanEdit'
import TacticalBoard from './pages/TacticalBoard'
import TacticalVideo from './pages/TacticalVideo'
import PaymentCheckout from './pages/PaymentCheckout'
import PaymentReturn from './pages/PaymentReturn'
import SupportChat from './components/SupportChat/SupportChat'

function PrivateRoute({ children, adminOnly, libraryStaffOnly, redirectAdminTo }) {
  const { user, loading } = useAuth()
  const { persona, isEditorAccount } = useEditorPersona()
  const { viewAs } = useAdminViewAs()

  if (loading) return <div className="loading">Загрузка...</div>
  if (!user) return <Navigate to="/login" replace />

  if (adminOnly && !user.isAdmin) {
    return <Navigate to="/cabinet" replace />
  }

  if (libraryStaffOnly) {
    if (!user.isAdmin && !user.isEditor) return <Navigate to="/cabinet" replace />
    if (user.isEditor && !user.isAdmin && isEditorAccount && persona !== 'editor') {
      return <Navigate to="/cabinet" replace />
    }
  }

  if (redirectAdminTo && user.isAdmin && viewAs == null) {
    return <Navigate to={redirectAdminTo} replace />
  }

  return children
}

export default function App() {
  return (
    <AuthProvider>
      <AdminViewAsProvider>
        <EditorPersonaProvider>
          <ProfileProvider>
          <BrowserRouter>
            <FaviconUpdater />
            <DeviceAnalyticsReporter />
            <SupportChat />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/cabinet" element={
                <PrivateRoute redirectAdminTo="/admin"><Cabinet /></PrivateRoute>
              } />
              <Route path="/admin" element={
                <PrivateRoute adminOnly><AdminCabinet /></PrivateRoute>
              } />
              <Route path="/admin/library" element={
                <PrivateRoute libraryStaffOnly><LibraryStaffLayout /></PrivateRoute>
              }>
                <Route index element={<AdminLibraryList />} />
                <Route path="folder/:folderId" element={<AdminLibraryFolderEdit />} />
                <Route path="folder/:folderId/exercise/new" element={<AdminLibraryEdit />} />
                <Route path="exercise/:id" element={<AdminLibraryEdit />} />
              </Route>
              <Route path="/library" element={
                <PrivateRoute><LibraryPage /></PrivateRoute>
              } />
              <Route path="/plan/new" element={
                <PrivateRoute><PlanCreate /></PrivateRoute>
              } />
              <Route path="/board" element={
                <PrivateRoute><TacticalBoard /></PrivateRoute>
              } />
              <Route path="/board/video" element={
                <PrivateRoute><TacticalVideo /></PrivateRoute>
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
          </ProfileProvider>
        </EditorPersonaProvider>
      </AdminViewAsProvider>
    </AuthProvider>
  )
}
