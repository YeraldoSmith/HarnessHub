export const sessionCookie = 'hh_session'

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const pair of header.split(';')) {
    const [key, ...value] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

export function extractSessionToken(
  authorization: string | undefined,
  cookie: string | undefined,
): string | null {
  if (authorization?.startsWith('Bearer ')) {
    const value = authorization.slice('Bearer '.length).trim()
    if (/^[A-Za-z0-9_-]{32,128}$/.test(value)) return value
  }
  const value = cookieValue(cookie, sessionCookie)
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null
}
