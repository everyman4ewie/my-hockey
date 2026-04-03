import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAdminViewAs } from '../context/AdminViewAsContext'

/**
 * Тариф для отображения лимитов/кнопок в UI. У админа в режиме превью подставляется выбранный тариф.
 */
export function useEffectiveUiTariff(profileEffectiveTariff) {
  const { user } = useAuth()
  const { viewAs } = useAdminViewAs()

  return useMemo(() => {
    if (!user?.isAdmin) {
      return profileEffectiveTariff || 'free'
    }
    if (viewAs === 'free' || viewAs === 'pro' || viewAs === 'pro_plus') {
      return viewAs
    }
    if (viewAs === 'editor_user' || viewAs === 'editor_editor') {
      return profileEffectiveTariff && profileEffectiveTariff !== 'admin' ? profileEffectiveTariff : 'free'
    }
    return 'admin'
  }, [user?.isAdmin, profileEffectiveTariff, viewAs])
}
