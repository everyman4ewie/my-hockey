import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAdminViewAs } from '../context/AdminViewAsContext'

/** Опции для authFetch / getAuthHeaders в режиме превью админа. */
export function useAuthFetchOpts() {
  const { getToken, user } = useAuth()
  const { viewAs } = useAdminViewAs()
  return useMemo(
    () => ({
      getToken,
      viewAs: user?.isAdmin ? viewAs : null,
      isAdmin: !!user?.isAdmin
    }),
    [getToken, user?.isAdmin, viewAs]
  )
}
