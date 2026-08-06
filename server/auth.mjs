import { randomBytes } from 'node:crypto'
import { hashToken, verifyPassword } from './security.mjs'

const cookieName = 'finance_session'
const sessionLifetimeMs = 12 * 60 * 60 * 1000

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]),
  )
}

function requestIsSecure(request) {
  return process.env.COOKIE_SECURE === 'true' || request.secure || request.get('x-forwarded-proto') === 'https'
}

function cookieAttributes(request, maxAge) {
  const attributes = [`${cookieName}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`]
  if (requestIsSecure(request)) attributes.push('Secure')
  return attributes
}

export function authenticateCredentials(db, username, password) {
  const user = db.prepare(`
    select id, username, display_name, role, password_salt, password_hash
    from finance_users where username = ? collate nocase
  `).get(String(username ?? '').trim())
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) return null
  return user
}

export function createSession(db, userId, request) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  db.prepare(`
    insert into finance_sessions (token_hash, user_id, expires_at, created_at, last_seen_at, ip_address, user_agent)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashToken(token),
    userId,
    now + sessionLifetimeMs,
    now,
    now,
    request.ip ?? null,
    String(request.get('user-agent') ?? '').slice(0, 500) || null,
  )
  db.prepare('update finance_users set last_login_at = ?, updated_at = ? where id = ?').run(new Date().toISOString(), new Date().toISOString(), userId)
  return token
}

export function setSessionCookie(response, request, token) {
  const attributes = cookieAttributes(request, Math.floor(sessionLifetimeMs / 1000))
  attributes[0] = `${cookieName}=${encodeURIComponent(token)}`
  response.setHeader('Set-Cookie', attributes.join('; '))
}

export function clearSessionCookie(response, request) {
  response.setHeader('Set-Cookie', cookieAttributes(request, 0).join('; '))
}

export function resolveSession(db, request) {
  const token = parseCookies(request.headers.cookie)[cookieName]
  if (!token) return null
  const tokenHash = hashToken(token)
  const now = Date.now()
  const session = db.prepare(`
    select
      sessions.token_hash,
      sessions.expires_at,
      users.id,
      users.username,
      users.display_name as displayName,
      users.role,
      users.created_at as createdAt,
      users.last_login_at as lastLoginAt
    from finance_sessions sessions
    join finance_users users on users.id = sessions.user_id
    where sessions.token_hash = ? and sessions.expires_at > ?
  `).get(tokenHash, now)
  if (!session) return null
  db.prepare('update finance_sessions set last_seen_at = ? where token_hash = ?').run(now, tokenHash)
  const { token_hash: _tokenHash, expires_at: _expiresAt, ...user } = session
  return { tokenHash, user }
}

export function deleteSession(db, request) {
  const token = parseCookies(request.headers.cookie)[cookieName]
  if (token) db.prepare('delete from finance_sessions where token_hash = ?').run(hashToken(token))
}

export function cleanExpiredSessions(db) {
  db.prepare('delete from finance_sessions where expires_at <= ?').run(Date.now())
}

export function requireAuth(db) {
  return (request, response, next) => {
    const session = resolveSession(db, request)
    if (!session) {
      response.status(401).json({ error: 'Authentification requise.' })
      return
    }
    request.financeSession = session
    next()
  }
}

export function requireAdmin(request, response, next) {
  if (request.financeSession?.user.role !== 'admin') {
    response.status(403).json({ error: 'Seul un administrateur peut créer un utilisateur depuis l’interface.' })
    return
  }
  next()
}

export function requireSameOrigin(request, response, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next()
    return
  }
  const origin = request.get('origin')
  const fetchSite = request.get('sec-fetch-site')
  if (fetchSite === 'cross-site') {
    response.status(403).json({ error: 'Requête intersite refusée.' })
    return
  }
  if (origin) {
    try {
      if (new URL(origin).host !== request.get('host')) {
        response.status(403).json({ error: 'Origine refusée.' })
        return
      }
    } catch {
      response.status(403).json({ error: 'Origine invalide.' })
      return
    }
  }
  next()
}
