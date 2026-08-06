import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const backupVersion = 1
const userTables = {
  finance_profiles: ['user_id', 'currency', 'monthly_savings_min', 'emergency_reserve_months', 'created_at', 'updated_at'],
  finance_accounts: ['id', 'user_id', 'name', 'account_type', 'is_savings', 'opening_balance', 'is_active', 'notes', 'created_at', 'updated_at'],
  finance_transactions: ['id', 'user_id', 'account_id', 'destination_account_id', 'transaction_type', 'amount', 'category', 'counterparty', 'description', 'occurred_at', 'is_unplanned', 'created_at', 'updated_at'],
  finance_fixed_expenses: ['id', 'user_id', 'account_id', 'name', 'category', 'amount', 'frequency', 'next_due_date', 'is_active', 'notes', 'created_at', 'updated_at'],
  finance_income_sources: ['id', 'user_id', 'account_id', 'name', 'amount', 'frequency', 'next_expected_date', 'probability', 'is_active', 'notes', 'created_at', 'updated_at'],
  finance_savings_exceptions: ['id', 'user_id', 'exception_year', 'exception_month', 'reason', 'declared_at'],
  finance_unplanned_events: ['id', 'user_id', 'transaction_id', 'name', 'estimated_amount', 'probability', 'expected_on', 'status', 'notes', 'created_at', 'updated_at'],
  finance_savings_goals: ['id', 'user_id', 'name', 'target_amount', 'target_date', 'priority', 'status', 'notes', 'created_at', 'updated_at'],
}

const restoreOrder = [
  'finance_profiles',
  'finance_accounts',
  'finance_transactions',
  'finance_fixed_expenses',
  'finance_income_sources',
  'finance_savings_exceptions',
  'finance_unplanned_events',
  'finance_savings_goals',
]

export function exportUserData(db, userId) {
  const user = db.prepare(`
    select id, username, display_name, role, password_salt, password_hash, created_at, updated_at, last_login_at
    from finance_users where id = ?
  `).get(userId)
  if (!user) throw new Error('Utilisateur introuvable.')

  const tables = {}
  for (const table of restoreOrder) tables[table] = db.prepare(`select * from ${table} where user_id = ?`).all(userId)
  return {
    format: 'finance-management-backup',
    version: backupVersion,
    kind: 'user',
    exported_at: new Date().toISOString(),
    user,
    tables,
  }
}

export function exportAllData(db) {
  const users = db.prepare('select id from finance_users order by created_at').all()
  return {
    format: 'finance-management-backup',
    version: backupVersion,
    kind: 'all',
    exported_at: new Date().toISOString(),
    users: users.map(({ id }) => exportUserData(db, id)),
  }
}

export function encryptBackup(backup, passphrase) {
  if (String(passphrase).length < 12) throw new Error('La phrase secrète doit contenir au moins 12 caractères.')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(String(passphrase), salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(backup), 'utf8'), cipher.final()])
  return Buffer.from(`${JSON.stringify({
    format: 'finance-management-encrypted-backup',
    version: 1,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url'),
  })}\n`)
}

export function decryptBackup(buffer, passphrase) {
  let envelope
  try {
    envelope = JSON.parse(Buffer.from(buffer).toString('utf8'))
  } catch {
    throw new Error('Fichier de sauvegarde invalide.')
  }
  if (
    envelope.format !== 'finance-management-encrypted-backup' ||
    envelope.version !== 1 ||
    envelope.algorithm !== 'aes-256-gcm' ||
    envelope.kdf !== 'scrypt'
  ) {
    throw new Error('Format de sauvegarde non pris en charge.')
  }
  try {
    const key = scryptSync(String(passphrase), Buffer.from(envelope.salt, 'base64url'), 32)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64url')),
      decipher.final(),
    ])
    const backup = JSON.parse(decrypted.toString('utf8'))
    if (backup.format !== 'finance-management-backup' || backup.version !== backupVersion) {
      throw new Error('Format interne invalide.')
    }
    return backup
  } catch {
    throw new Error('Phrase secrète incorrecte ou sauvegarde corrompue.')
  }
}

function insertRow(db, table, columns, row, userId) {
  if (!row || typeof row !== 'object') throw new Error(`Ligne invalide dans ${table}.`)
  const values = columns.map((column) => column === 'user_id' ? userId : row[column] ?? null)
  const placeholders = columns.map(() => '?').join(', ')
  db.prepare(`insert into ${table} (${columns.join(', ')}) values (${placeholders})`).run(...values)
}

function restoreUserUnsafe(db, backup, replace) {
  if (backup?.kind !== 'user' || !backup.user || typeof backup.tables !== 'object') {
    throw new Error('Sauvegarde utilisateur invalide.')
  }
  const user = backup.user
  const conflicts = db.prepare('select id from finance_users where id = ? or username = ? collate nocase').all(user.id, user.username)
  if (conflicts.length && !replace) throw new Error(`L’utilisateur ${user.username} existe déjà.`)
  for (const conflict of conflicts) db.prepare('delete from finance_users where id = ?').run(conflict.id)

  db.prepare(`
    insert into finance_users (id, username, display_name, role, password_salt, password_hash, created_at, updated_at, last_login_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.username, user.display_name ?? null, user.role, user.password_salt, user.password_hash, user.created_at, user.updated_at, user.last_login_at ?? null)

  for (const table of restoreOrder) {
    const rows = backup.tables[table]
    if (!Array.isArray(rows)) throw new Error(`Table ${table} absente de la sauvegarde.`)
    if (rows.length > 100_000) throw new Error(`Table ${table} trop volumineuse.`)
    for (const row of rows) insertRow(db, table, userTables[table], row, user.id)
  }
}

export function restoreUserData(db, backup, { replace = false } = {}) {
  db.transaction(() => restoreUserUnsafe(db, backup, replace))()
}

export function restoreAllData(db, backup, { replace = false } = {}) {
  if (backup?.kind !== 'all' || !Array.isArray(backup.users)) throw new Error('Sauvegarde complète invalide.')
  db.transaction(() => {
    if (replace) db.prepare('delete from finance_users').run()
    for (const userBackup of backup.users) restoreUserUnsafe(db, userBackup, replace)
  })()
}
