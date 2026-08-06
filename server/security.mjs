import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function normalizeUsername(value) {
  const username = String(value ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new Error('Le nom d’utilisateur doit contenir 3 à 32 caractères : lettres, chiffres, point, tiret ou underscore.')
  }
  return username
}

export function assertPassword(value) {
  const password = String(value ?? '')
  if (password.length < 12 || password.length > 256) {
    throw new Error('Le mot de passe doit contenir entre 12 et 256 caractères.')
  }
  return password
}

export function generatePassword() {
  return randomBytes(18).toString('base64url')
}

export function hashPassword(value) {
  const password = assertPassword(value)
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return { salt: salt.toString('base64url'), hash: hash.toString('base64url') }
}

export function verifyPassword(value, saltValue, hashValue) {
  const expected = Buffer.from(hashValue, 'base64url')
  const actual = scryptSync(String(value ?? ''), Buffer.from(saltValue, 'base64url'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
