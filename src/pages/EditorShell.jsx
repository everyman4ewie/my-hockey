import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { Home, BookOpen, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useEditorPersona } from '../context/EditorPersonaContext'
import HockeyDecorations from '../components/HockeyDecorations/HockeyDecorations'
import './Cabinet.css'
import './AdminCabinet.css'

/**
 * Компактная оболочка редактора каталога (два пункта меню).
 */
export default function EditorShell() {
  const { user, logout } = useAuth()
  const { setPersona } = useEditorPersona()
  const navigate = useNavigate()
  const location = useLocation()
  const libActive = location.pathname.startsWith('/admin/library')
  const homeActive = location.pathname === '/'

  function handleToUserMode() {
    setPersona('user')
    navigate('/cabinet')
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="cabinet admin-cabinet cabinet-ice">
      <HockeyDecorations />
      <aside className="cabinet-sidebar">
        <div className="admin-sidebar-header">
          <span className="admin-badge admin-badge--editor">Редактор</span>
          <h2>Каталог</h2>
        </div>
        <nav className="cabinet-nav">
          <Link to="/" className={`cabinet-nav-item${homeActive ? ' active' : ''}`}>
            <span className="cabinet-nav-icon">
              <Home size={20} />
            </span>
            Главная
          </Link>
          <Link to="/admin/library" className={`cabinet-nav-item${libActive ? ' active' : ''}`}>
            <span className="cabinet-nav-icon">
              <BookOpen size={20} />
            </span>
            Каталог упражнений
          </Link>
          <button
            type="button"
            className="cabinet-nav-item cabinet-nav-item--back-to-user"
            onClick={handleToUserMode}
          >
            <span className="cabinet-nav-icon">
              <User size={20} />
            </span>
            Вернуться к роли пользователя
          </button>
        </nav>
        <div className="cabinet-sidebar-footer editor-shell-footer">
          <button type="button" className="cabinet-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="cabinet-content">
        <header className="cabinet-header">
          <div className="cabinet-user-info">
            <div className="cabinet-avatar-placeholder">E</div>
            <div>
              <h1>{user?.login || 'Редактор'}</h1>
              <p className="cabinet-email">{user?.email}</p>
            </div>
          </div>
        </header>
        <main className="cabinet-main admin-library-layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
