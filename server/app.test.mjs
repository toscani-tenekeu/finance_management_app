import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from './app.mjs'
import { closeDatabase, createUser, openDatabase } from './database.mjs'

const resources = []

afterEach(async () => {
  while (resources.length) {
    const resource = resources.pop()
    await new Promise((resolve) => resource.server.close(resolve))
    resource.app.locals.closeEventHub()
    closeDatabase(resource.db)
    fs.rmSync(resource.directory, { recursive: true, force: true })
  }
})

async function testServer() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-api-'))
  const db = openDatabase(path.join(directory, 'finance.db'))
  createUser(db, { username: 'admin', password: 'admin-password-123', role: 'admin' })
  const app = createApp({ db, distPath: path.join(directory, 'dist') })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  const origin = `http://127.0.0.1:${address.port}`
  resources.push({ directory, db, app, server })
  return { origin }
}

async function login(origin, username, password) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie').split(';', 1)[0]
}

describe('local API authorization', () => {
  it('keeps HTTP assets usable before SSL is configured', async () => {
    const { origin } = await testServer()
    const response = await fetch(`${origin}/`)
    expect(response.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests')
    expect(response.headers.get('strict-transport-security')).toBeNull()
  })

  it('isolates finance rows and reserves UI user creation for admin', async () => {
    const { origin } = await testServer()
    const adminCookie = await login(origin, 'admin', 'admin-password-123')
    const headers = { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' }

    const account = await fetch(`${origin}/api/finance/accounts`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Admin cash', account_type: 'cash', is_savings: false, opening_balance: 5000, is_active: true, notes: null }),
    })
    expect(account.status).toBe(201)

    const created = await fetch(`${origin}/api/users`, {
      method: 'POST', headers, body: JSON.stringify({ username: 'second', password: 'second-password-123', displayName: 'Second' }),
    })
    expect(created.status).toBe(201)

    const secondCookie = await login(origin, 'second', 'second-password-123')
    const secondFinance = await fetch(`${origin}/api/finance`, { headers: { Cookie: secondCookie } }).then((response) => response.json())
    expect(secondFinance.accounts).toEqual([])

    const visibleUsers = await fetch(`${origin}/api/users`, { headers: { Cookie: secondCookie } })
    expect(visibleUsers.status).toBe(200)
    expect((await visibleUsers.json()).users).toHaveLength(2)

    const forbidden = await fetch(`${origin}/api/users`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: secondCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'third', password: 'third-password-123' }),
    })
    expect(forbidden.status).toBe(403)
  })
})
