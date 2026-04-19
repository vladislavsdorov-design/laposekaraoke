export function setCookie(name, value, options = {}) {
  const { days = 30, path = '/' } = options
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Expires=${expires}; Path=${path}; SameSite=Lax`
}

export function getCookie(name) {
  const key = `${encodeURIComponent(name)}=`
  const parts = document.cookie.split(';')
  for (const raw of parts) {
    const cookie = raw.trim()
    if (cookie.startsWith(key)) return decodeURIComponent(cookie.slice(key.length))
  }
  return null
}

export function deleteCookie(name, options = {}) {
  const { path = '/' } = options
  document.cookie = `${encodeURIComponent(name)}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path}; SameSite=Lax`
}

