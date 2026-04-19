export function getOrCreateLocalId(key) {
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  localStorage.setItem(key, id)
  return id
}

export function readLocal(key) {
  return localStorage.getItem(key)
}

export function writeLocal(key, value) {
  localStorage.setItem(key, value)
}

export function removeLocal(key) {
  localStorage.removeItem(key)
}

