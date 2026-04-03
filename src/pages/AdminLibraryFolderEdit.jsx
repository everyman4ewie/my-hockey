import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { Save, Loader2, ArrowLeft, ImageIcon } from 'lucide-react'
import './AdminLibrary.css'

const MAX_IMAGE_CHARS = 900_000

export default function AdminLibraryFolderEdit() {
  const { getToken } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const navigate = useNavigate()
  const { folderId } = useParams()
  const isNew = folderId === 'new'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')
  const [order, setOrder] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (isNew || !folderId) return
    setLoading(true)
    authFetch('/api/admin/library/folders', { ...authFetchOpts })
      .then((r) => r.json())
      .then((list) => {
        const f = Array.isArray(list) ? list.find((x) => x.id === folderId) : null
        if (!f) {
          navigate('/admin/library', { replace: true })
          return
        }
        setTitle(f.title || '')
        setDescription(f.description || '')
        setImage(f.image || '')
        setOrder(typeof f.order === 'number' ? f.order : 0)
      })
      .catch(() => navigate('/admin/library', { replace: true }))
      .finally(() => setLoading(false))
  }, [folderId, getToken, isNew, navigate, authFetchOpts])

  useEffect(() => {
    load()
  }, [load])

  function onPickImage(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      if (s.length > MAX_IMAGE_CHARS) {
        window.alert('Файл слишком большой. Выберите изображение меньшего размера или укажите ссылку.')
        return
      }
      setImage(s)
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const body = { title: title || 'Без названия', description, image, order: Number(order) || 0 }
      if (isNew) {
        const res = await authFetch('/api/admin/library/folders', {
          ...authFetchOpts,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка')
      } else {
        const res = await authFetch(`/api/admin/library/folders/${folderId}`, {
          ...authFetchOpts,
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка')
      }
      navigate('/admin/library')
    } catch (e) {
      setError(e.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
      <div className="admin-library-folder-page admin-library-folder-edit admin-library-edit-page">
        <header className="admin-library-folder-toolbar">
          <Link to="/admin/library" className="admin-library-folder-back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            К каталогу
          </Link>
          <h1 className="admin-library-folder-page-title">{isNew ? 'Новая папка' : 'Папка'}</h1>
        </header>

        {error ? (
          <p className="plan-error admin-library-folder-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-library-folder-card">
          <div className="admin-library-folder-fields">
            <label className="admin-library-field">
              <span className="admin-library-field-label">Название</span>
              <input
                type="text"
                className="admin-library-field-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Как в каталоге"
              />
            </label>
            <label className="admin-library-field admin-library-field--full">
              <span className="admin-library-field-label">Краткое описание</span>
              <input
                type="text"
                className="admin-library-field-control"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Строка под названием в списке"
              />
            </label>
            <label className="admin-library-field admin-library-field--order">
              <span className="admin-library-field-label">Порядок</span>
              <input
                type="number"
                className="admin-library-field-control"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="admin-library-folder-image-panel">
            <span className="admin-library-field-label">Обложка</span>
            <p className="admin-library-folder-image-lead">Миниатюра в списке папок. Можно загрузить файл или вставить ссылку.</p>
            <div className="admin-library-folder-image-row">
              <label className="btn-outline admin-library-file-label">
                <ImageIcon size={16} strokeWidth={2} aria-hidden />
                Выбрать файл
                <input type="file" accept="image/*" className="sr-only" onChange={onPickImage} />
              </label>
              {image ? <img src={image} alt="" className="admin-library-folder-thumb" /> : null}
            </div>
            <textarea
              className="admin-library-field-control admin-library-image-url"
              rows={2}
              placeholder="URL или data:image…"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </div>

          <div className="admin-library-folder-actions">
            <button type="button" className="btn-primary admin-library-folder-save" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <Loader2 className="plan-action-icon plan-action-spinner" size={20} strokeWidth={2} />
              ) : (
                <Save size={20} strokeWidth={2} />
              )}
              <span>{saving ? 'Сохранение…' : 'Сохранить'}</span>
            </button>
          </div>
        </div>
      </div>
  )
}
