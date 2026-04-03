import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AdminLibraryLayout from '../components/AdminLibraryLayout/AdminLibraryLayout'
import EditorShell from './EditorShell'

/** Оболочка каталога: полная админ-панель или компактная панель редактора. */
export default function LibraryStaffLayout() {
  const { user } = useAuth()
  if (user?.isAdmin) {
    return (
      <AdminLibraryLayout>
        <Outlet />
      </AdminLibraryLayout>
    )
  }
  return (
    <EditorShell>
      <Outlet />
    </EditorShell>
  )
}
