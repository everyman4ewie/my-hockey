import { createContext, useContext, useState, useCallback, useMemo } from 'react'

/**
 * Клиентский превью-доступ для администратора (без смены токена).
 * null — обычный режим админа.
 */
export const ADMIN_VIEW_AS_OPTIONS = [
  { id: null, label: 'Без превью (админ)' },
  { id: 'free', label: 'Как пользователь (бесплатный)' },
  { id: 'pro', label: 'Как пользователь (Про)' },
  { id: 'pro_plus', label: 'Как пользователь (Про+)' },
  { id: 'editor_user', label: 'Как редактор — режим пользователя' },
  { id: 'editor_editor', label: 'Как редактор — режим редактора' }
]

const AdminViewAsContext = createContext(null)

export function AdminViewAsProvider({ children }) {
  const [viewAs, setViewAs] = useState(null)

  const clear = useCallback(() => setViewAs(null), [])

  const value = useMemo(
    () => ({
      viewAs,
      setViewAs,
      clearViewAs: clear
    }),
    [viewAs, clear]
  )

  return <AdminViewAsContext.Provider value={value}>{children}</AdminViewAsContext.Provider>
}

export function useAdminViewAs() {
  const ctx = useContext(AdminViewAsContext)
  if (!ctx) throw new Error('useAdminViewAs must be used within AdminViewAsProvider')
  return ctx
}
