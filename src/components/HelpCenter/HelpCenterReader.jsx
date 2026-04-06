import { useState, useEffect, useMemo, useCallback } from 'react'
import { authFetch } from '../../utils/authFetch'
import { HelpCenterBlocks } from './HelpCenterBlocks'
import { ChevronDown } from 'lucide-react'
import './HelpCenterReader.css'

function normalizeSearchWords(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function blockTextForSearch(b) {
  if (!b || typeof b !== 'object') return ''
  if (b.type === 'paragraph' || b.type === 'heading') return String(b.text || '')
  if (b.type === 'image') return `${b.alt || ''} ${b.src || ''}`
  if (b.type === 'video') return String(b.src || '')
  return ''
}

function articleSearchHaystack(article) {
  const title = String(article?.title || '')
  const blocks = Array.isArray(article?.blocks) ? article.blocks : []
  const fromBlocks = blocks.map(blockTextForSearch).join(' ')
  return `${title} ${fromBlocks}`
}

function articleMatchesWords(article, words) {
  if (!words.length) return true
  const hay = articleSearchHaystack(article).toLowerCase()
  return words.every((w) => hay.includes(w))
}

export default function HelpCenterReader({ getToken, viewAs, isAdmin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catId, setCatId] = useState(null)
  const [articleId, setArticleId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [openSections, setOpenSections] = useState({})

  const setSectionOpen = useCallback((id, open) => {
    setOpenSections((prev) => ({ ...prev, [id]: open }))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    authFetch('/api/help/center', { getToken, viewAs, isAdmin })
      .then((r) => {
        if (!r.ok) throw new Error('Не удалось загрузить материалы')
        return r.json()
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        const cats = Array.isArray(json?.categories) ? json.categories : []
        const arts = Array.isArray(json?.articles) ? json.articles : []
        if (cats.length) {
          const sorted = [...cats].sort(
            (a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title))
          )
          const first = sorted[0]
          setCatId(first.id)
          setOpenSections({ [first.id]: true })
          const inCat = arts.filter((a) => a.categoryId === first.id)
          const sortedArt = [...inCat].sort(
            (a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title))
          )
          setArticleId(sortedArt[0]?.id ?? null)
        } else {
          setCatId(null)
          setArticleId(null)
          setOpenSections({})
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Ошибка сети')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getToken, viewAs, isAdmin])

  const categories = data?.categories || []
  const articles = data?.articles || []

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title))
      ),
    [categories]
  )

  const searchWords = useMemo(() => normalizeSearchWords(searchQuery), [searchQuery])

  const sortedArticlesInCategory = useCallback(
    (cId) => {
      const list = articles.filter((a) => a.categoryId === cId)
      return [...list].sort((a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title)))
    },
    [articles]
  )

  const filteredArticlesInCat = useCallback(
    (cId) => {
      const list = sortedArticlesInCategory(cId)
      if (!searchWords.length) return list
      return list.filter((a) => articleMatchesWords(a, searchWords))
    },
    [sortedArticlesInCategory, searchWords]
  )

  const searchHits = useMemo(() => {
    if (!searchWords.length) return []
    const hits = []
    for (const c of sortedCategories) {
      for (const a of sortedArticlesInCategory(c.id)) {
        if (articleMatchesWords(a, searchWords)) {
          hits.push({ article: a, category: c })
        }
      }
    }
    return hits
  }, [sortedCategories, sortedArticlesInCategory, searchWords])

  const selectedArticle = useMemo(() => articles.find((a) => a.id === articleId), [articles, articleId])

  /** При вводе поиска переключаем на первое подходящее совпадение. */
  useEffect(() => {
    if (!searchWords.length) return
    const cur = articles.find((a) => a.id === articleId)
    if (cur && articleMatchesWords(cur, searchWords)) return
    for (const c of sortedCategories) {
      for (const a of sortedArticlesInCategory(c.id)) {
        if (articleMatchesWords(a, searchWords)) {
          setCatId(c.id)
          setArticleId(a.id)
          return
        }
      }
    }
    setArticleId(null)
  }, [searchQuery, searchWords, articles, articleId, sortedCategories, sortedArticlesInCategory])

  useEffect(() => {
    if (!searchWords.length) return
    setOpenSections((prev) => {
      const next = { ...prev }
      for (const c of sortedCategories) {
        if (filteredArticlesInCat(c.id).length) next[c.id] = true
      }
      return next
    })
  }, [searchWords, sortedCategories, filteredArticlesInCat])

  function selectArticle(cId, aId) {
    setCatId(cId)
    setArticleId(aId)
    setSectionOpen(cId, true)
  }

  if (loading) {
    return <p className="help-center-loading">Загрузка…</p>
  }
  if (error) {
    return <p className="cabinet-error" role="alert">{error}</p>
  }

  return (
    <div className="help-center-reader">
      <div className="help-center-search">
        <label className="help-center-search-label" htmlFor="help-center-search-input">
          Поиск по статьям
        </label>
        <input
          id="help-center-search-input"
          type="search"
          className="help-center-search-input"
          placeholder="Начните вводить слово…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
        />
        {searchWords.length > 0 ? (
          <div className="help-center-search-hits" role="listbox" aria-label="Результаты поиска">
            {searchHits.length === 0 ? (
              <p className="help-center-search-empty">Ничего не найдено.</p>
            ) : (
              <ul className="help-center-search-hit-list">
                {searchHits.map(({ article: a, category: c }) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`help-center-search-hit${a.id === articleId && c.id === catId ? ' active' : ''}`}
                      role="option"
                      aria-selected={a.id === articleId && c.id === catId}
                      onClick={() => selectArticle(c.id, a.id)}
                    >
                      <span className="help-center-search-hit-title">{a.title}</span>
                      <span className="help-center-search-hit-meta">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="help-center-reader-layout">
        <aside className="help-center-sidebar" aria-label="Разделы и статьи">
          {!sortedCategories.length ? (
            <p className="cabinet-muted">Материалы ещё не добавлены.</p>
          ) : (
            <ul className="help-center-accordion">
              {sortedCategories.map((c) => {
                const list = searchWords.length ? filteredArticlesInCat(c.id) : sortedArticlesInCategory(c.id)
                const isOpen = !!openSections[c.id]
                return (
                  <li key={c.id} className="help-center-accordion-item">
                    <button
                      type="button"
                      className={`help-center-accordion-summary${isOpen ? ' open' : ''}`}
                      onClick={() => setSectionOpen(c.id, !isOpen)}
                      aria-expanded={isOpen}
                    >
                      <ChevronDown className="help-center-accordion-chevron" size={18} aria-hidden />
                      <span className="help-center-accordion-title">{c.title}</span>
                      <span className="help-center-accordion-count">{list.length}</span>
                    </button>
                    {isOpen ? (
                      <ul className="help-center-accordion-articles">
                        {list.length === 0 ? (
                          <li className="help-center-accordion-empty">
                            {searchWords.length ? 'Нет статей по запросу' : 'Нет статей'}
                          </li>
                        ) : (
                          list.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                className={`help-center-art-btn${a.id === articleId && c.id === catId ? ' active' : ''}`}
                                onClick={() => selectArticle(c.id, a.id)}
                              >
                                {a.title}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
        <article className="help-center-article">
          {!sortedCategories.length ? (
            <p className="cabinet-muted">Материалы обучения ещё не добавлены администратором.</p>
          ) : !selectedArticle ? (
            <p className="cabinet-muted">
              {searchWords.length && !searchHits.length
                ? 'Нет статей по этому запросу.'
                : 'Выберите статью слева или в списке результатов поиска.'}
            </p>
          ) : (
            <>
              <h2 className="help-center-article-title">{selectedArticle.title}</h2>
              <HelpCenterBlocks blocks={selectedArticle.blocks} />
            </>
          )}
        </article>
      </div>
    </div>
  )
}
