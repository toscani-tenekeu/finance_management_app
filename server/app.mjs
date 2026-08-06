import compression from 'compression'
import express from 'express'
import helmet from 'helmet'
import fs from 'node:fs'
import path from 'node:path'
import {
  authenticateCredentials,
  clearSessionCookie,
  createSession,
  deleteSession,
  requireAdmin,
  requireAuth,
  requireSameOrigin,
  resolveSession,
  setSessionCookie,
} from './auth.mjs'
import { encryptBackup, exportUserData } from './backup.mjs'
import { createUser, getSafeUser, nowIso } from './database.mjs'
import { createEventHub } from './events.mjs'
import { createFinanceRouter } from './finance-router.mjs'
import { assertPassword, generatePassword, hashPassword, verifyPassword } from './security.mjs'
import { createUserSchema, loginSchema, validationMessage } from './validation.mjs'

function parse(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) {
    const error = new Error(validationMessage(result.error))
    error.status = 400
    throw error
  }
  return result.data
}

function handleRoute(handler) {
  return (request, response, next) => {
    try {
      const result = handler(request, response)
      if (result instanceof Promise) result.catch(next)
    } catch (error) {
      next(error)
    }
  }
}

export function createApp({ db, distPath }) {
  const app = express()
  const events = createEventHub()
  const loginAttempts = new Map()

  app.disable('x-powered-by')
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.use(compression())
  app.use(express.json({ limit: '64kb' }))
  app.use('/api', requireSameOrigin)

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'finance-management-app', storage: 'sqlite' })
  })

  app.get('/api/auth/me', (request, response) => {
    const session = resolveSession(db, request)
    response.set('Cache-Control', 'no-store')
    response.json({ user: session?.user ?? null })
  })

  app.post('/api/auth/login', handleRoute((request, response) => {
    const input = parse(loginSchema, request.body)
    const key = request.ip ?? 'unknown'
    const attempt = loginAttempts.get(key) ?? { count: 0, blockedUntil: 0 }
    if (attempt.blockedUntil > Date.now()) {
      response.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' })
      return
    }

    const user = authenticateCredentials(db, input.username, input.password)
    if (!user) {
      const count = attempt.count + 1
      loginAttempts.set(key, { count: count >= 5 ? 0 : count, blockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 })
      response.status(401).json({ error: 'Identifiants incorrects.' })
      return
    }

    loginAttempts.delete(key)
    const token = createSession(db, user.id, request)
    setSessionCookie(response, request, token)
    response.json({ user: getSafeUser(db, user.id) })
  }))

  app.post('/api/auth/logout', (request, response) => {
    deleteSession(db, request)
    clearSessionCookie(response, request)
    response.json({ user: null })
  })

  const authenticated = requireAuth(db)

  app.get('/api/users', authenticated, (request, response) => {
    const users = db.prepare(`
      select id, username, display_name as displayName, role, created_at as createdAt, last_login_at as lastLoginAt
      from finance_users order by created_at
    `).all()
    response.json({ users })
  })

  app.post('/api/users', authenticated, requireAdmin, handleRoute((request, response) => {
    const input = parse(createUserSchema, request.body)
    const generated = !input.password
    const password = input.password ?? generatePassword()
    const user = createUser(db, {
      username: input.username,
      password,
      displayName: input.displayName,
      role: 'user',
    })
    response.status(201).json({
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
      generatedPassword: generated ? password : null,
    })
  }))

  app.post('/api/account/password', authenticated, handleRoute((request, response) => {
    const currentPassword = String(request.body?.currentPassword ?? '')
    const newPassword = assertPassword(request.body?.newPassword)
    const userId = request.financeSession.user.id
    const credentials = db.prepare('select password_salt, password_hash from finance_users where id = ?').get(userId)
    if (!credentials || !verifyPassword(currentPassword, credentials.password_salt, credentials.password_hash)) {
      response.status(401).json({ error: 'Mot de passe actuel incorrect.' })
      return
    }
    const next = hashPassword(newPassword)
    db.transaction(() => {
      db.prepare('update finance_users set password_salt = ?, password_hash = ?, updated_at = ? where id = ?')
        .run(next.salt, next.hash, nowIso(), userId)
      db.prepare('delete from finance_sessions where user_id = ? and token_hash <> ?').run(userId, request.financeSession.tokenHash)
    })()
    response.json({ ok: true })
  }))

  app.post('/api/account/backup', authenticated, handleRoute((request, response) => {
    const password = String(request.body?.password ?? '')
    const passphrase = String(request.body?.passphrase ?? '')
    const userId = request.financeSession.user.id
    const credentials = db.prepare('select username, password_salt, password_hash from finance_users where id = ?').get(userId)
    if (!credentials || !verifyPassword(password, credentials.password_salt, credentials.password_hash)) {
      response.status(401).json({ error: 'Mot de passe incorrect.' })
      return
    }
    const backup = encryptBackup(exportUserData(db, userId), passphrase)
    const date = new Date().toISOString().slice(0, 10)
    response.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="finance-${credentials.username}-${date}.fmbak"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(backup.length),
    })
    response.send(backup)
  }))

  app.delete('/api/account', authenticated, handleRoute((request, response) => {
    const password = String(request.body?.password ?? '')
    const confirmation = String(request.body?.confirmation ?? '')
    const userId = request.financeSession.user.id
    const credentials = db.prepare('select password_salt, password_hash from finance_users where id = ?').get(userId)
    if (confirmation !== 'SUPPRIMER' || !credentials || !verifyPassword(password, credentials.password_salt, credentials.password_hash)) {
      response.status(400).json({ error: 'Mot de passe ou confirmation incorrecte.' })
      return
    }
    db.prepare('delete from finance_users where id = ?').run(userId)
    clearSessionCookie(response, request)
    response.json({ deleted: true })
  }))

  app.use('/api/finance', createFinanceRouter(db, events))

  app.use(
    express.static(distPath, {
      etag: true,
      maxAge: '1h',
      setHeaders(response, filePath) {
        if (filePath.endsWith('index.html')) response.setHeader('Cache-Control', 'no-cache')
      },
    }),
  )

  app.use('/api/{*path}', (_request, response) => response.status(404).json({ error: 'Route inconnue.' }))
  app.get('/{*path}', (_request, response) => {
    const indexPath = path.join(distPath, 'index.html')
    if (!fs.existsSync(indexPath)) {
      response.status(503).send('Frontend non construit. Exécutez npm run build.')
      return
    }
    response.sendFile(indexPath)
  })

  app.use((error, _request, response, _next) => {
    const sqliteConflict = String(error.code ?? '').startsWith('SQLITE_CONSTRAINT')
    const status = Number(error.status) || (sqliteConflict ? 409 : 500)
    if (status >= 500) console.error(error)
    response.status(status).json({
      error: sqliteConflict
        ? 'Cette opération entre en conflit avec des données existantes.'
        : status >= 500
          ? 'Une erreur interne est survenue.'
          : error.message,
    })
  })

  app.locals.closeEventHub = events.close
  return app
}
