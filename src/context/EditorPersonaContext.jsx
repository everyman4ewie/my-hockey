import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'hockey_editor_persona'

const EditorPersonaContext = createContext(null)

/** Режим «Пользователь» | «Редактор» только для учёток с isEditor (не site admin). */
export function EditorPersonaProvider({ children }) {
  const { user } = useAuth()
  const isEditorAccount = !!(user?.isEditor && !user?.isAdmin)

  const [persona, setPersonaState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'editor' || raw === 'user') return raw
    } catch (_) {}
    return 'user'
  })

  useEffect(() => {
    if (!isEditorAccount && persona !== 'user') {
      setPersonaState('user')
    }
  }, [isEditorAccount, persona])

  const setPersona = useCallback((next) => {
    if (next !== 'user' && next !== 'editor') return
    setPersonaState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch (_) {}
  }, [])

  const value = useMemo(
    () => ({
      persona: isEditorAccount ? persona : 'user',
      setPersona,
      isEditorAccount
    }),
    [persona, setPersona, isEditorAccount]
  )

  return <EditorPersonaContext.Provider value={value}>{children}</EditorPersonaContext.Provider>
}

export function useEditorPersona() {
  const ctx = useContext(EditorPersonaContext)
  if (!ctx) throw new Error('useEditorPersona must be used within EditorPersonaProvider')
  return ctx
}
