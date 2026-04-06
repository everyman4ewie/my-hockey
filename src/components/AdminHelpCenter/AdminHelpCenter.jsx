import { useState, useEffect, useMemo, useCallback } from 'react'
import { HelpCenterBlocks } from '../HelpCenter/HelpCenterBlocks'
import './AdminHelpCenter.css'

function newId() {
  return crypto.randomUUID()
}

export default function AdminHelpCenter({ token }) {
  const [helpCenter, setHelpCenter] = useState({ categories: [], articles: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [catId, setCatId] = useState(null)
  const [articleId, setArticleId] = useState(null)

  const headersJson = {
    'Content-Type': 'application/json',
    Authorization: token
  }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetch('/api/admin/help/center', { credentials: 'include', headers: { Authorization: token } })
      .then((r) => r.json())
      .then((data) => {
        setHelpCenter({
          categories: Array.isArray(data.categories) ? data.categories : [],
          articles: Array.isArray(data.articles) ? data.articles : []
        })
        const cats = Array.isArray(data.categories) ? data.categories : []
        if (cats.length) {
          const sorted = [...cats].sort((a, b) => a.order - b.order)
          const c0 = sorted[0]
          setCatId(c0.id)
          const arts = (data.articles || []).filter((a) => a.categoryId === c0.id)
          const sortedA = [...arts].sort((a, b) => a.order - b.order)
          setArticleId(sortedA[0]?.id ?? null)
        } else {
          setCatId(null)
          setArticleId(null)
        }
      })
      .catch(() => setError('Не удалось загрузить'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const categories = helpCenter.categories || []
  const articles = helpCenter.articles || []

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order || String(a.title).localeCompare(b.title)),
    [categories]
  )

  const articlesInCat = useMemo(() => {
    const list = articles.filter((a) => a.categoryId === catId)
    return [...list].sort((a, b) => a.order - b.order || String(a.title).localeCompare(b.title))
  }, [articles, catId])

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === articleId && a.categoryId === catId),
    [articles, articleId, catId]
  )

  useEffect(() => {
    if (!catId || articlesInCat.some((a) => a.id === articleId)) return
    setArticleId(articlesInCat[0]?.id ?? null)
  }, [catId, articleId, articlesInCat])

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/admin/help/center', {
        method: 'PUT',
        credentials: 'include',
        headers: headersJson,
        body: JSON.stringify(helpCenter)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      setHelpCenter(data.helpCenter || helpCenter)
      setMessage('Сохранено')
      setTimeout(() => setMessage(''), 3000)
    } catch (e) {
      setError(e.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  function addCategory() {
    const maxO = categories.reduce((m, c) => Math.max(m, c.order || 0), -1)
    const id = newId()
    setHelpCenter((h) => ({
      ...h,
      categories: [...h.categories, { id, title: 'Новый раздел', order: maxO + 1 }]
    }))
    setCatId(id)
    setArticleId(null)
  }

  function deleteCategory(id) {
    if (!window.confirm('Удалить раздел и все статьи в нём?')) return
    setHelpCenter((h) => ({
      ...h,
      categories: h.categories.filter((c) => c.id !== id),
      articles: h.articles.filter((a) => a.categoryId !== id)
    }))
    if (catId === id) {
      setCatId(null)
      setArticleId(null)
    }
  }

  function setCategoryTitle(id, title) {
    setHelpCenter((h) => ({
      ...h,
      categories: h.categories.map((c) => (c.id === id ? { ...c, title } : c))
    }))
  }

  function moveCategory(id, dir) {
    const idx = sortedCats.findIndex((c) => c.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= sortedCats.length) return
    const a = sortedCats[idx]
    const b = sortedCats[swap]
    setHelpCenter((h) => ({
      ...h,
      categories: h.categories.map((c) => {
        if (c.id === a.id) return { ...c, order: b.order }
        if (c.id === b.id) return { ...c, order: a.order }
        return c
      })
    }))
  }

  function addArticle() {
    if (!catId) return
    const maxO = articles.filter((a) => a.categoryId === catId).reduce((m, a) => Math.max(m, a.order || 0), -1)
    const id = newId()
    const now = new Date().toISOString()
    setHelpCenter((h) => ({
      ...h,
      articles: [
        ...h.articles,
        {
          id,
          categoryId: catId,
          title: 'Новая статья',
          order: maxO + 1,
          updatedAt: now,
          blocks: [{ type: 'paragraph', text: '' }]
        }
      ]
    }))
    setArticleId(id)
  }

  function deleteArticle(id) {
    if (!window.confirm('Удалить статью?')) return
    setHelpCenter((h) => ({
      ...h,
      articles: h.articles.filter((a) => a.id !== id)
    }))
    if (articleId === id) setArticleId(null)
  }

  function setArticleTitle(id, title) {
    setHelpCenter((h) => ({
      ...h,
      articles: h.articles.map((a) =>
        a.id === id ? { ...a, title, updatedAt: new Date().toISOString() } : a
      )
    }))
  }

  function moveArticle(id, dir) {
    const idx = articlesInCat.findIndex((a) => a.id === id)
    const swap = idx + dir
    if (swap < 0 || swap >= articlesInCat.length) return
    const x = articlesInCat[idx]
    const y = articlesInCat[swap]
    setHelpCenter((h) => ({
      ...h,
      articles: h.articles.map((a) => {
        if (a.id === x.id) return { ...a, order: y.order }
        if (a.id === y.id) return { ...a, order: x.order }
        return a
      })
    }))
  }

  function updateBlocks(artId, blocks) {
    setHelpCenter((h) => ({
      ...h,
      articles: h.articles.map((a) =>
        a.id === artId ? { ...a, blocks, updatedAt: new Date().toISOString() } : a
      )
    }))
  }

  function addBlock(artId, type) {
    const art = articles.find((a) => a.id === artId)
    const blocks = [...(art?.blocks || [])]
    if (type === 'paragraph') blocks.push({ type: 'paragraph', text: '' })
    else if (type === 'heading') blocks.push({ type: 'heading', level: 2, text: '' })
    else if (type === 'image') blocks.push({ type: 'image', src: '', alt: '' })
    else if (type === 'video') blocks.push({ type: 'video', kind: 'embed', src: '' })
    updateBlocks(artId, blocks)
  }

  function setBlock(artId, index, patch) {
    const art = articles.find((a) => a.id === artId)
    if (!art) return
    const blocks = (art.blocks || []).map((b, i) => (i === index ? { ...b, ...patch } : b))
    updateBlocks(artId, blocks)
  }

  function removeBlock(artId, index) {
    const art = articles.find((a) => a.id === artId)
    if (!art) return
    const blocks = (art.blocks || []).filter((_, i) => i !== index)
    updateBlocks(artId, blocks)
  }

  function moveBlock(artId, index, dir) {
    const art = articles.find((a) => a.id === artId)
    if (!art) return
    const blocks = [...(art.blocks || [])]
    const j = index + dir
    if (j < 0 || j >= blocks.length) return
    ;[blocks[index], blocks[j]] = [blocks[j], blocks[index]]
    updateBlocks(artId, blocks)
  }

  async function uploadHelpFile(artId, blockIndex, file, kind) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    const url = kind === 'image' ? '/api/admin/help/upload-image' : '/api/admin/help/upload-video'
    const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { Authorization: token }, body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
    if (data.url) {
      if (kind === 'image') setBlock(artId, blockIndex, { src: data.url })
      else setBlock(artId, blockIndex, { kind: 'file', src: data.url })
    }
  }

  if (loading) {
    return <p className="cabinet-muted">Загрузка…</p>
  }

  return (
    <div className="admin-help-center">
      <p className="cabinet-muted admin-help-intro">
        Разделы и статьи видят пользователи в личном кабинете («Обучение»). Сохраняйте изменения кнопкой внизу.
      </p>
      {error ? (
        <p className="cabinet-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="cabinet-form-message" role="status">
          {message}
        </p>
      ) : null}

      <div className="admin-help-grid">
        <div className="admin-help-col">
          <h3 className="admin-dash-section-title">Разделы</h3>
          <button type="button" className="btn-outline btn-sm admin-help-add" onClick={addCategory}>
            + Раздел
          </button>
          <ul className="admin-help-list">
            {sortedCats.map((c, i) => (
              <li
                key={c.id}
                className={c.id === catId ? 'active' : ''}
                onClick={() => {
                  setCatId(c.id)
                  setArticleId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setCatId(c.id)
                    setArticleId(null)
                  }
                }}
                role="presentation"
              >
                <input
                  type="text"
                  value={c.title}
                  onChange={(e) => setCategoryTitle(c.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="admin-help-cat-input"
                  aria-label="Название раздела"
                />
                <div className="admin-help-row-actions">
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      moveCategory(c.id, -1)
                    }}
                    title="Выше"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={i === sortedCats.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      moveCategory(c.id, 1)
                    }}
                    title="Ниже"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-delete btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteCategory(c.id)
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-help-col">
          <h3 className="admin-dash-section-title">Статьи</h3>
          <button type="button" className="btn-outline btn-sm admin-help-add" onClick={addArticle} disabled={!catId}>
            + Статья
          </button>
          <ul className="admin-help-list admin-help-articles">
            {articlesInCat.map((a, i) => (
              <li key={a.id} className={a.id === articleId ? 'active' : ''}>
                <button type="button" className="admin-help-select" onClick={() => setArticleId(a.id)}>
                  {a.title || 'Без названия'}
                </button>
                <div className="admin-help-row-actions">
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      moveArticle(a.id, -1)
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={i === articlesInCat.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      moveArticle(a.id, 1)
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-delete btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteArticle(a.id)
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-help-editor">
          {selectedArticle ? (
            <>
              <label className="admin-field-label">
                Заголовок статьи
                <input
                  type="text"
                  className="cabinet-input-wide"
                  value={selectedArticle.title}
                  onChange={(e) => setArticleTitle(selectedArticle.id, e.target.value)}
                />
              </label>
              <div className="admin-help-blocks-toolbar">
                <span className="admin-help-blocks-label">Блоки:</span>
                <button type="button" className="btn-outline btn-sm" onClick={() => addBlock(selectedArticle.id, 'paragraph')}>
                  Текст
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => addBlock(selectedArticle.id, 'heading')}>
                  Заголовок
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => addBlock(selectedArticle.id, 'image')}>
                  Фото
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => addBlock(selectedArticle.id, 'video')}>
                  Видео
                </button>
              </div>
              {(selectedArticle.blocks || []).map((b, i) => (
                <div key={i} className="admin-help-block">
                  <div className="admin-help-block-head">
                    <span className="admin-help-block-type">{b.type}</span>
                    <button type="button" className="btn-outline btn-sm" disabled={i === 0} onClick={() => moveBlock(selectedArticle.id, i, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      disabled={i === (selectedArticle.blocks || []).length - 1}
                      onClick={() => moveBlock(selectedArticle.id, i, 1)}
                    >
                      ↓
                    </button>
                    <button type="button" className="btn-delete btn-sm" onClick={() => removeBlock(selectedArticle.id, i)}>
                      Удалить блок
                    </button>
                  </div>
                  {b.type === 'paragraph' ? (
                    <textarea
                      className="admin-help-textarea"
                      rows={5}
                      value={b.text || ''}
                      onChange={(e) => setBlock(selectedArticle.id, i, { text: e.target.value })}
                      placeholder="Текст абзаца"
                    />
                  ) : null}
                  {b.type === 'heading' ? (
                    <>
                      <select
                        value={b.level === 3 ? 3 : 2}
                        onChange={(e) => setBlock(selectedArticle.id, i, { level: Number(e.target.value) })}
                      >
                        <option value={2}>Заголовок 2</option>
                        <option value={3}>Заголовок 3</option>
                      </select>
                      <input
                        type="text"
                        className="cabinet-input-wide"
                        value={b.text || ''}
                        onChange={(e) => setBlock(selectedArticle.id, i, { text: e.target.value })}
                        placeholder="Текст"
                      />
                    </>
                  ) : null}
                  {b.type === 'image' ? (
                    <>
                      <label className="admin-field-label">
                        URL изображения
                        <input
                          type="text"
                          className="cabinet-input-wide"
                          value={b.src || ''}
                          onChange={(e) => setBlock(selectedArticle.id, i, { src: e.target.value })}
                        />
                      </label>
                      <label className="admin-field-label">
                        Подпись (alt)
                        <input
                          type="text"
                          className="cabinet-input-wide"
                          value={b.alt || ''}
                          onChange={(e) => setBlock(selectedArticle.id, i, { alt: e.target.value })}
                        />
                      </label>
                      <label className="admin-help-file">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            e.target.value = ''
                            if (!f) return
                            try {
                              await uploadHelpFile(selectedArticle.id, i, f, 'image')
                            } catch (err) {
                              window.alert(err.message || 'Ошибка')
                            }
                          }}
                        />
                        Загрузить файл…
                      </label>
                    </>
                  ) : null}
                  {b.type === 'video' ? (
                    <>
                      <label className="admin-field-label">
                        Тип
                        <select
                          value={b.kind === 'file' ? 'file' : 'embed'}
                          onChange={(e) =>
                            setBlock(selectedArticle.id, i, { kind: e.target.value === 'file' ? 'file' : 'embed', src: b.src || '' })
                          }
                        >
                          <option value="embed">Ссылка (YouTube / Vimeo)</option>
                          <option value="file">Файл MP4 / WebM</option>
                        </select>
                      </label>
                      <label className="admin-field-label">
                        {b.kind === 'file' ? 'URL файла на сервере' : 'Ссылка на ролик'}
                        <input
                          type="text"
                          className="cabinet-input-wide"
                          value={b.src || ''}
                          onChange={(e) => setBlock(selectedArticle.id, i, { src: e.target.value })}
                          placeholder={b.kind === 'file' ? '/uploads/help/videos/...' : 'https://www.youtube.com/watch?v=...'}
                        />
                      </label>
                      {b.kind === 'file' ? (
                        <label className="admin-help-file">
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            onChange={async (e) => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              if (!f) return
                              try {
                                await uploadHelpFile(selectedArticle.id, i, f, 'video')
                              } catch (err) {
                                window.alert(err.message || 'Ошибка')
                              }
                            }}
                          />
                          Загрузить видео…
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ))}
              <div className="admin-help-preview-wrap">
                <h4 className="admin-dash-section-title">Предпросмотр</h4>
                <div className="admin-help-preview-inner">
                  <HelpCenterBlocks blocks={selectedArticle.blocks || []} />
                </div>
              </div>
            </>
          ) : (
            <p className="cabinet-muted">Выберите статью или создайте новую.</p>
          )}
        </div>
      </div>

      <div className="admin-help-save-row">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Сохранение…' : 'Сохранить всё'}
        </button>
      </div>
    </div>
  )
}
