import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { decryptBackup, encryptBackup, exportUserData, restoreUserData } from './backup.mjs'
import { closeDatabase, createUser, openDatabase } from './database.mjs'

const resources = []

afterEach(() => {
  while (resources.length) {
    const resource = resources.pop()
    if (resource.db?.open) closeDatabase(resource.db)
    fs.rmSync(resource.directory, { recursive: true, force: true })
  }
})

function database() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-db-'))
  const db = openDatabase(path.join(directory, 'finance.db'))
  resources.push({ directory, db })
  return db
}

describe('SQLite storage and backups', () => {
  it('creates only prefixed application tables and enables WAL', () => {
    const db = database()
    const tables = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all()
    expect(tables.length).toBeGreaterThan(5)
    expect(tables.every(({ name }) => name.startsWith('finance_'))).toBe(true)
    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal')
  })

  it('round-trips one user with encrypted isolated data', () => {
    const source = database()
    const user = createUser(source, { username: 'alice', password: 'very-secure-password', role: 'user' })
    const now = new Date().toISOString()
    source.prepare(`insert into finance_accounts (id, user_id, name, account_type, is_savings, opening_balance, is_active, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('account-1', user.id, 'Cash', 'cash', 0, 25000, 1, null, now, now)

    const encrypted = encryptBackup(exportUserData(source, user.id), 'backup-passphrase')
    expect(encrypted.toString('utf8')).not.toContain('alice')
    expect(() => decryptBackup(encrypted, 'wrong-passphrase')).toThrow()

    const target = database()
    restoreUserData(target, decryptBackup(encrypted, 'backup-passphrase'))
    expect(target.prepare('select username from finance_users').get().username).toBe('alice')
    expect(target.prepare('select opening_balance from finance_accounts').get().opening_balance).toBe(25000)
  })
})
