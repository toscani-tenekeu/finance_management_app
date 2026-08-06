import { randomUUID } from 'node:crypto'
import express from 'express'
import { requireAuth } from './auth.mjs'
import { nowIso } from './database.mjs'
import {
  accountSchema,
  fixedExpenseSchema,
  incomeSourceSchema,
  payFixedSchema,
  profileSchema,
  savingsExceptionSchema,
  savingsGoalSchema,
  transactionSchema,
  unplannedEventSchema,
  validationMessage,
} from './validation.mjs'

const booleanColumns = new Set(['is_savings', 'is_active', 'is_unplanned'])

function normalizeRow(row) {
  if (!row) return row
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, booleanColumns.has(key) ? Boolean(value) : value]),
  )
}

function normalizeRows(rows) {
  return rows.map(normalizeRow)
}

function parse(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) {
    const error = new Error(validationMessage(result.error))
    error.status = 400
    throw error
  }
  return result.data
}

function ownedAccount(db, userId, accountId) {
  if (!accountId) return null
  return db.prepare('select id, is_savings from finance_accounts where id = ? and user_id = ?').get(accountId, userId) ?? null
}

function assertOwnedReference(db, table, userId, id) {
  if (!id) return
  const allowedTables = new Set(['finance_accounts', 'finance_transactions'])
  if (!allowedTables.has(table)) throw new Error('Invalid reference table')
  if (!db.prepare(`select 1 from ${table} where id = ? and user_id = ?`).get(id, userId)) {
    const error = new Error('Référence introuvable.')
    error.status = 400
    throw error
  }
}

function addMonths(value, count) {
  const source = new Date(`${value}T12:00:00.000Z`)
  const day = source.getUTCDate()
  source.setUTCDate(1)
  source.setUTCMonth(source.getUTCMonth() + count)
  const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate()
  source.setUTCDate(Math.min(day, lastDay))
  return source.toISOString().slice(0, 10)
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

export function createFinanceRouter(db, events) {
  const router = express.Router()
  router.use(requireAuth(db))

  router.get('/events', (request, response) => {
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Encoding': 'identity',
    })
    response.flushHeaders()
    const unsubscribe = events.subscribe(request.financeSession.user.id, response)
    request.on('close', unsubscribe)
  })

  router.get('/', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const profile = db.prepare(`
      select profiles.*, users.display_name
      from finance_profiles profiles
      join finance_users users on users.id = profiles.user_id
      where profiles.user_id = ?
    `).get(userId)
    response.json({
      profile: normalizeRow(profile),
      accounts: normalizeRows(db.prepare('select * from finance_accounts where user_id = ? order by created_at').all(userId)),
      transactions: normalizeRows(db.prepare('select * from finance_transactions where user_id = ? order by occurred_at desc').all(userId)),
      fixedExpenses: normalizeRows(db.prepare('select * from finance_fixed_expenses where user_id = ? order by next_due_date').all(userId)),
      incomeSources: normalizeRows(db.prepare('select * from finance_income_sources where user_id = ? order by created_at').all(userId)),
      savingsExceptions: normalizeRows(db.prepare('select * from finance_savings_exceptions where user_id = ? order by exception_year desc, exception_month desc').all(userId)),
      unplannedEvents: normalizeRows(db.prepare('select * from finance_unplanned_events where user_id = ? order by expected_on is null, expected_on').all(userId)),
      savingsGoals: normalizeRows(db.prepare('select * from finance_savings_goals where user_id = ? order by target_date').all(userId)),
    })
  }))

  router.post('/accounts', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(accountSchema, request.body)
    const id = randomUUID()
    const timestamp = nowIso()
    db.prepare(`
      insert into finance_accounts (id, user_id, name, account_type, is_savings, opening_balance, is_active, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.name, input.account_type, Number(input.is_savings), input.opening_balance, Number(input.is_active), input.notes, timestamp, timestamp)
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/transactions', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(transactionSchema, request.body)
    const source = ownedAccount(db, userId, input.account_id)
    if (!source) throw Object.assign(new Error('Compte source introuvable.'), { status: 400 })
    const destination = input.destination_account_id ? ownedAccount(db, userId, input.destination_account_id) : null
    if (input.destination_account_id && !destination) throw Object.assign(new Error('Compte de destination introuvable.'), { status: 400 })
    if (input.transaction_type === 'savings_deposit' && (Boolean(source.is_savings) || !Boolean(destination?.is_savings))) {
      throw Object.assign(new Error('Un dépôt d’épargne doit aller d’un solde utilisable vers un compte d’épargne.'), { status: 400 })
    }
    if (input.transaction_type === 'savings_withdrawal' && (!Boolean(source.is_savings) || Boolean(destination?.is_savings))) {
      throw Object.assign(new Error('Un retrait d’épargne doit aller vers un solde utilisable.'), { status: 400 })
    }
    const id = randomUUID()
    const timestamp = nowIso()
    db.prepare(`
      insert into finance_transactions (
        id, user_id, account_id, destination_account_id, transaction_type, amount, category,
        counterparty, description, occurred_at, is_unplanned, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.account_id, input.destination_account_id, input.transaction_type, input.amount, input.category, input.counterparty, input.description, input.occurred_at, Number(input.is_unplanned), timestamp, timestamp)
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/fixed-expenses', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(fixedExpenseSchema, request.body)
    assertOwnedReference(db, 'finance_accounts', userId, input.account_id)
    const id = randomUUID()
    const timestamp = nowIso()
    db.prepare(`
      insert into finance_fixed_expenses (id, user_id, account_id, name, category, amount, frequency, next_due_date, is_active, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.account_id, input.name, input.category, input.amount, input.frequency, input.next_due_date, Number(input.is_active), input.notes, timestamp, timestamp)
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/fixed-expenses/:id/pay', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(payFixedSchema, request.body)
    const pay = db.transaction(() => {
      const expense = db.prepare('select * from finance_fixed_expenses where id = ? and user_id = ? and is_active = 1').get(request.params.id, userId)
      if (!expense) throw Object.assign(new Error('Dépense fixe introuvable.'), { status: 404 })
      if (!expense.account_id) throw Object.assign(new Error('Associez un compte avant d’enregistrer le paiement.'), { status: 400 })
      const id = randomUUID()
      const timestamp = nowIso()
      db.prepare(`
        insert into finance_transactions (
          id, user_id, account_id, destination_account_id, transaction_type, amount, category,
          counterparty, description, occurred_at, is_unplanned, created_at, updated_at
        ) values (?, ?, ?, null, 'expense', ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(id, userId, expense.account_id, expense.amount, expense.category, expense.name, 'Dépense fixe enregistrée comme payée', `${input.paid_on}T12:00:00.000Z`, timestamp, timestamp)
      const months = expense.frequency === 'monthly' ? 1 : expense.frequency === 'quarterly' ? 3 : 12
      db.prepare('update finance_fixed_expenses set next_due_date = ?, updated_at = ? where id = ? and user_id = ?').run(addMonths(expense.next_due_date, months), timestamp, expense.id, userId)
      return id
    })
    const id = pay()
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/income-sources', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(incomeSourceSchema, request.body)
    assertOwnedReference(db, 'finance_accounts', userId, input.account_id)
    const id = randomUUID()
    const timestamp = nowIso()
    db.prepare(`
      insert into finance_income_sources (id, user_id, account_id, name, amount, frequency, next_expected_date, probability, is_active, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.account_id, input.name, input.amount, input.frequency, input.next_expected_date, input.probability, Number(input.is_active), input.notes, timestamp, timestamp)
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/savings-exceptions', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(savingsExceptionSchema, request.body)
    const id = randomUUID()
    db.prepare(`insert into finance_savings_exceptions (id, user_id, exception_year, exception_month, reason, declared_at) values (?, ?, ?, ?, ?, ?)`)
      .run(id, userId, input.exception_year, input.exception_month, input.reason, nowIso())
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/unplanned-events', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(unplannedEventSchema, request.body)
    assertOwnedReference(db, 'finance_transactions', userId, input.transaction_id)
    const id = randomUUID()
    const timestamp = nowIso()
    db.prepare(`
      insert into finance_unplanned_events (id, user_id, transaction_id, name, estimated_amount, probability, expected_on, status, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.transaction_id, input.name, input.estimated_amount, input.probability, input.expected_on, input.status, input.notes, timestamp, timestamp)
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.post('/savings-goals', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(savingsGoalSchema, request.body)
    const id = randomUUID()
    const timestamp = nowIso()
    db.prepare(`
      insert into finance_savings_goals (id, user_id, name, target_amount, target_date, priority, status, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.name, input.target_amount, input.target_date, input.priority, input.status, input.notes, timestamp, timestamp)
    events.publish(userId)
    response.status(201).json({ id })
  }))

  router.patch('/profile', handleRoute((request, response) => {
    const userId = request.financeSession.user.id
    const input = parse(profileSchema, request.body)
    const timestamp = nowIso()
    db.transaction(() => {
      db.prepare('update finance_users set display_name = ?, updated_at = ? where id = ?').run(input.display_name, timestamp, userId)
      db.prepare('update finance_profiles set monthly_savings_min = ?, emergency_reserve_months = ?, updated_at = ? where user_id = ?')
        .run(input.monthly_savings_min, input.emergency_reserve_months, timestamp, userId)
    })()
    events.publish(userId)
    response.json({ ok: true })
  }))

  const deleteTables = new Map([
    ['accounts', 'finance_accounts'],
    ['transactions', 'finance_transactions'],
    ['fixed-expenses', 'finance_fixed_expenses'],
    ['income-sources', 'finance_income_sources'],
    ['savings-exceptions', 'finance_savings_exceptions'],
    ['unplanned-events', 'finance_unplanned_events'],
    ['savings-goals', 'finance_savings_goals'],
  ])
  router.delete('/:resource/:id', handleRoute((request, response) => {
    const table = deleteTables.get(request.params.resource)
    if (!table) throw Object.assign(new Error('Ressource inconnue.'), { status: 404 })
    const userId = request.financeSession.user.id
    const result = db.prepare(`delete from ${table} where id = ? and user_id = ?`).run(request.params.id, userId)
    if (result.changes === 0) throw Object.assign(new Error('Élément introuvable.'), { status: 404 })
    events.publish(userId)
    response.status(204).end()
  }))

  return router
}
