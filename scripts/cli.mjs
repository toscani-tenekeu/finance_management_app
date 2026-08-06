#!/usr/bin/env node
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  decryptBackup,
  encryptBackup,
  exportAllData,
  exportUserData,
  restoreAllData,
  restoreUserData,
} from '../server/backup.mjs'
import { closeDatabase, countUsers, createUser, openDatabase } from '../server/database.mjs'
import { assertPassword, generatePassword, hashPassword, normalizeUsername } from '../server/security.mjs'

const args = process.argv.slice(2)
const command = args.shift() ?? 'help'
const databasePath = path.resolve(process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'finance.db'))

function hasFlag(flag) {
  return args.includes(flag)
}

function flagValue(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function positionals() {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) { index += 1; continue }
    values.push(args[index])
  }
  return values
}

async function promptHidden(label) {
  if (process.env.FINANCE_CLI_SECRET) return process.env.FINANCE_CLI_SECRET
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return fs.readFileSync(0, 'utf8').trim()
  return new Promise((resolve, reject) => {
    let value = ''
    process.stdout.write(label)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const onData = (chunk) => {
      const input = chunk.toString('utf8')
      for (const character of input) {
        if (character === '\u0003') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdout.write('\n')
          reject(new Error('Opération annulée.'))
          return
        }
        if (character === '\r' || character === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (character === '\u007f') {
          value = value.slice(0, -1)
          continue
        }
        value += character
      }
    }
    process.stdin.on('data', onData)
  })
}

async function askPassphrase() {
  const first = await promptHidden('Phrase secrète du backup (12 caractères minimum) : ')
  const second = process.env.FINANCE_CLI_SECRET ? first : await promptHidden('Confirmez la phrase secrète : ')
  if (first !== second) throw new Error('Les phrases secrètes sont différentes.')
  assertPassword(first)
  return first
}

function writeBackup(filePath, content) {
  const resolved = path.resolve(filePath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 })
  fs.writeFileSync(resolved, content, { mode: 0o600 })
  fs.chmodSync(resolved, 0o600)
  console.log(`Sauvegarde créée : ${resolved}`)
}

function defaultBackupName(scope) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return path.resolve(process.cwd(), `finance-${scope}-${stamp}.fmbak`)
}

function findUser(db, username) {
  const user = db.prepare('select * from finance_users where username = ? collate nocase').get(normalizeUsername(username))
  if (!user) throw new Error(`Utilisateur ${username} introuvable.`)
  return user
}

function help() {
  console.log(`Finance Management App — commandes locales

  finance-app status
  finance-app list-users
  finance-app create-user <username> [--display-name "Nom"] [--admin]
  finance-app reset-password <username>
  finance-app set-role <username> <admin|user>
  finance-app delete-user <username>
  finance-app backup-user <username> [fichier.fmbak]
  finance-app restore-user <fichier.fmbak> [--replace]
  finance-app backup-all [fichier.fmbak]
  finance-app restore-all <fichier.fmbak> [--replace]
  finance-app update
  finance-app uninstall

Les commandes locales ne vérifient aucun rôle applicatif. Les permissions Linux s’appliquent.`)
}

let db
try {
  if (command === 'help' || command === '--help' || command === '-h') {
    help()
    process.exit(0)
  }

  db = openDatabase(databasePath)
  const values = positionals()

  if (command === 'init') {
    if (countUsers(db) > 0) throw new Error('L’installation contient déjà un utilisateur.')
    const username = flagValue('--username') ?? values[0] ?? 'admin'
    const password = process.env.FINANCE_INITIAL_PASSWORD || generatePassword()
    const user = createUser(db, { username, password, displayName: 'Administrateur', role: 'admin' })
    if (hasFlag('--json')) console.log(JSON.stringify({ username: user.username, password }))
    else console.log(`Administrateur créé\nUtilisateur : ${user.username}\nMot de passe : ${password}`)
  } else if (command === 'status') {
    const wal = db.pragma('journal_mode', { simple: true })
    console.log(`Base : ${databasePath}\nUtilisateurs : ${countUsers(db)}\nSQLite : ${db.pragma('user_version', { simple: true })}\nJournal : ${wal}`)
  } else if (command === 'list-users') {
    const users = db.prepare('select username, display_name, role, created_at, last_login_at from finance_users order by created_at').all()
    console.table(users)
  } else if (command === 'create-user') {
    const username = values[0]
    if (!username) throw new Error('Indiquez le nom d’utilisateur.')
    const password = process.env.FINANCE_INITIAL_PASSWORD || generatePassword()
    const user = createUser(db, {
      username,
      password,
      displayName: flagValue('--display-name') ?? null,
      role: hasFlag('--admin') ? 'admin' : 'user',
    })
    console.log(`Utilisateur créé\nUtilisateur : ${user.username}\nMot de passe : ${password}\nRôle : ${user.role}`)
  } else if (command === 'reset-password') {
    const user = findUser(db, values[0])
    let password = process.env.FINANCE_INITIAL_PASSWORD
    if (!password && hasFlag('--prompt')) password = await promptHidden('Nouveau mot de passe : ')
    if (!password) password = generatePassword()
    const next = hashPassword(password)
    db.transaction(() => {
      db.prepare('update finance_users set password_salt = ?, password_hash = ?, updated_at = ? where id = ?').run(next.salt, next.hash, new Date().toISOString(), user.id)
      db.prepare('delete from finance_sessions where user_id = ?').run(user.id)
    })()
    console.log(`Mot de passe réinitialisé pour ${user.username}\nNouveau mot de passe : ${password}`)
  } else if (command === 'set-role') {
    const user = findUser(db, values[0])
    const role = values[1]
    if (!['admin', 'user'].includes(role)) throw new Error('Le rôle doit être admin ou user.')
    db.prepare('update finance_users set role = ?, updated_at = ? where id = ?').run(role, new Date().toISOString(), user.id)
    console.log(`${user.username} possède maintenant le rôle ${role}.`)
  } else if (command === 'delete-user') {
    const user = findUser(db, values[0])
    if (!hasFlag('--yes')) throw new Error(`Ajoutez --yes pour confirmer la suppression complète de ${user.username}.`)
    db.prepare('delete from finance_users where id = ?').run(user.id)
    console.log(`Utilisateur ${user.username} et toutes ses données supprimés.`)
  } else if (command === 'backup-user') {
    const user = findUser(db, values[0])
    const output = values[1] ?? defaultBackupName(user.username)
    writeBackup(output, encryptBackup(exportUserData(db, user.id), await askPassphrase()))
  } else if (command === 'backup-all') {
    const output = values[0] ?? defaultBackupName('all')
    writeBackup(output, encryptBackup(exportAllData(db), await askPassphrase()))
  } else if (command === 'restore-user') {
    const input = values[0]
    if (!input) throw new Error('Indiquez le fichier de sauvegarde.')
    restoreUserData(db, decryptBackup(fs.readFileSync(path.resolve(input)), await promptHidden('Phrase secrète du backup : ')), { replace: hasFlag('--replace') })
    console.log('Sauvegarde utilisateur restaurée.')
  } else if (command === 'restore-all') {
    const input = values[0]
    if (!input) throw new Error('Indiquez le fichier de sauvegarde.')
    restoreAllData(db, decryptBackup(fs.readFileSync(path.resolve(input)), await promptHidden('Phrase secrète du backup : ')), { replace: hasFlag('--replace') })
    console.log('Sauvegarde complète restaurée.')
  } else {
    throw new Error(`Commande inconnue : ${command}`)
  }
} catch (error) {
  console.error(`Erreur : ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  if (db) closeDatabase(db)
}
