import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { Plus, Pencil, Trash2, BookOpen, FolderPlus } from 'lucide-react'
import { getTariffById } from '../constants/tariffs'
import './AdminLibrary.css'

export default function AdminLibraryList() {
  const { getToken } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const [folders, setFolders] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      authFetch('/api/admin/library/folders', { ...authFetchOpts }).then((r) => r.json()),
      authFetch('/api/admin/library', { ...authFetchOpts }).then((r) => r.json())
    ])
      .then(([f, it]) => {
        setFolders(Array.isArray(f) ? f : [])
        setItems(Array.isArray(it) ? it : [])
      })
      .catch(() => {
        setFolders([])
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [getToken, authFetchOpts])

  useEffect(() => {
    load()
  }, [load])

  const itemsByFolder = useMemo(() => {
    const m = new Map()
    for (const f of folders) {
      m.set(f.id, [])
    }
    for (const it of items) {
      const fid = it.folderId || folders[0]?.id
      if (!fid) continue
      if (!m.has(fid)) m.set(fid, [])
      m.get(fid).push(it)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'))
    }
    return m
  }, [folders, items])

  async function handleDeleteItem(id) {
    if (!window.confirm('Удалить запись каталога?')) return
    const res = await authFetch(`/api/admin/library/${id}`, {
      ...authFetchOpts,
      method: 'DELETE'
    })
    if (res.ok) load()
  }

  async function handleDeleteFolder(id) {
    if (!window.confirm('Удалить папку? Если в ней есть упражнения — удаление будет отклонено.')) return
    const res = await authFetch(`/api/admin/library/folders/${id}`, {
      ...authFetchOpts,
      method: 'DELETE'
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      window.alert(data.error || 'Не удалось удалить')
      return
    }
    load()
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  const sortedFolders = [...folders].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  )

  return (
      <div className="admin-library-page">
      <header className="admin-library-header admin-library-header--catalog">
        <div className="admin-library-title-block">
          <div className="admin-library-title-row">
            <BookOpen size={28} strokeWidth={1.75} aria-hidden />
            <h1>Каталог упражнений</h1>
          </div>
          <p className="admin-library-lead">Папки и записи каталога. Упражнения создаются внутри папки.</p>
        </div>
        <div className="admin-library-actions">
          <Link to="/admin/library/folder/new" className="btn-outline admin-library-new">
            <FolderPlus size={18} strokeWidth={2} aria-hidden />
            Новая папка
          </Link>
        </div>
      </header>

      {sortedFolders.length === 0 && (
        <p className="admin-library-empty">
          Сначала создайте папку. Упражнения добавляются только внутри папки.
        </p>
      )}

      {sortedFolders.map((folder) => {
        const list = itemsByFolder.get(folder.id) || []
        return (
          <section key={folder.id} className="admin-library-folder-section">
            <div className="admin-library-folder-head">
              <div className="admin-library-folder-head-main">
                {folder.image ? (
                  <img src={folder.image} alt="" className="admin-library-folder-cover" />
                ) : (
                  <div className="admin-library-folder-cover admin-library-folder-cover--placeholder" />
                )}
                <div>
                  <h2 className="admin-library-folder-title">{folder.title || 'Без названия'}</h2>
                  {folder.description ? <p className="admin-library-folder-desc">{folder.description}</p> : null}
                </div>
              </div>
              <div className="admin-library-folder-head-actions">
                <Link to={`/admin/library/folder/${folder.id}`} className="btn-outline btn-sm">
                  <Pencil size={14} strokeWidth={2} aria-hidden />
                  Папка
                </Link>
                <Link to={`/admin/library/folder/${folder.id}/exercise/new`} className="btn-primary btn-sm">
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  Упражнение
                </Link>
                <button type="button" className="btn-outline btn-sm" onClick={() => handleDeleteFolder(folder.id)}>
                  Удалить папку
                </button>
              </div>
            </div>

            <div className="admin-library-table-wrap">
              <table className="admin-library-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Упр.</th>
                    <th>Тариф</th>
                    <th>Опубликовано</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <Link to={`/admin/library/exercise/${it.id}`} className="admin-library-link-title">
                          {it.title || 'Без названия'}
                        </Link>
                        {it.description ? <div className="admin-library-desc">{it.description}</div> : null}
                      </td>
                      <td>{it.exercisesCount ?? (it.exercises?.length ?? 0)}</td>
                      <td>{getTariffById(it.minTariff)?.name ?? it.minTariff}</td>
                      <td>{it.published ? 'Да' : 'Нет'}</td>
                      <td className="admin-library-row-actions">
                        <Link to={`/admin/library/exercise/${it.id}`} className="btn-outline btn-icon-only" title="Редактировать">
                          <Pencil size={16} strokeWidth={2} />
                        </Link>
                        <button
                          type="button"
                          className="btn-outline btn-icon-only"
                          title="Удалить"
                          onClick={() => handleDeleteItem(it.id)}
                        >
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length === 0 && (
                <p className="admin-library-folder-empty">В этой папке пока нет упражнений. Создайте запись кнопкой «Упражнение».</p>
              )}
            </div>
          </section>
        )
      })}
      </div>
  )
}
