import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Home, ClipboardList, Activity, Users, Settings, FileText, Video, BookOpen } from 'lucide-react'
import HockeyDecorations from '../HockeyDecorations/HockeyDecorations'
import '../../pages/Cabinet.css'
import '../../pages/AdminCabinet.css'

/**
 * Оболочка админских страниц каталога: то же меню и фон, что у /admin (AdminCabinet).
 */
export default function AdminLibraryLayout({ children }) {
  const { user, logout, getToken } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isLibrary = location.pathname.startsWith('/admin/library')
  const [profile, setProfile] = useState({ login: '', email: '', name: '' })

  useEffect(() => {
    fetch('/api/admin/profile', { credentials: 'include', headers: { Authorization: getToken() } })
      .then((r) => r.json())
      .then((data) =>
        setProfile({
          login: data.login || '',
          email: data.email || '',
          name: data.name || ''
        })
      )
      .catch(() => {})
  }, [getToken])

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="cabinet admin-cabinet cabinet-ice">
      <HockeyDecorations />
      <aside className="cabinet-sidebar">
        <div className="admin-sidebar-header">
          <span className="admin-badge">Админ</span>
          <h2>Панель управления</h2>
        </div>
        <nav className="cabinet-nav">
          <Link to="/" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <Home size={20} />
            </span>
            Главная
          </Link>
          <Link to="/admin?section=plans" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <ClipboardList size={20} />
            </span>
            План-конспекты
          </Link>
          <Link to="/admin?section=videos" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <Video size={20} />
            </span>
            Мои видео
          </Link>
          <Link to="/admin?section=siteStatus" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <Activity size={20} />
            </span>
            Состояние сайта
          </Link>
          <Link to="/admin?section=users" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <Users size={20} />
            </span>
            Пользователи
          </Link>
          <Link to="/admin?section=profile" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <Settings size={20} />
            </span>
            Профиль админа
          </Link>
          <Link to="/admin?section=pages" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <FileText size={20} />
            </span>
            Редактор страниц
          </Link>
          <Link to="/admin/library" className={`cabinet-nav-item${isLibrary ? ' active' : ''}`}>
            <span className="cabinet-nav-icon">
              <BookOpen size={20} />
            </span>
            Каталог упражнений
          </Link>
        </nav>
        <div className="cabinet-sidebar-footer">
          <button type="button" className="cabinet-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="cabinet-content">
        <header className="cabinet-header">
          <div className="cabinet-user-info">
            <div className="cabinet-avatar-placeholder admin-avatar">A</div>
            <div>
              <h1>{profile.name || profile.login || user?.login || 'Администратор'}</h1>
              <p className="cabinet-email">{profile.email || user?.email}</p>
            </div>
          </div>
        </header>

        <main className="cabinet-main admin-library-layout-main">{children}</main>
      </div>
    </div>
  )
}
