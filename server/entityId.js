/**
 * Сопоставление id пользователя/сущностей: в data.json id может быть числом (старые данные),
 * из токена приходит строка — строгое === давало «Пользователь не найден».
 */
export function sameEntityId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function findUserById(data, userId) {
  if (!data?.users || userId == null) return undefined
  return data.users.find((u) => sameEntityId(u.id, userId))
}
