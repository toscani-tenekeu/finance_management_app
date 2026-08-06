import { describe, expect, it } from 'vitest'
import { calculateAccountBalances } from './balances'
import { calculateForecast } from './forecast'
import type { FinanceData } from '../types'

const timestamp = '2026-01-01T00:00:00.000Z'
const baseData: FinanceData = {
  profile: {
    user_id: 'user-1',
    display_name: 'Test',
    currency: 'XAF',
    monthly_savings_min: 15000,
    emergency_reserve_months: 3,
    created_at: timestamp,
    updated_at: timestamp,
  },
  accounts: [
    { id: 'cash', user_id: 'user-1', name: 'Disponible', account_type: 'cash', is_savings: false, opening_balance: 100000, is_active: true, notes: null, created_at: timestamp, updated_at: timestamp },
    { id: 'save', user_id: 'user-1', name: 'Épargne', account_type: 'savings', is_savings: true, opening_balance: 20000, is_active: true, notes: null, created_at: timestamp, updated_at: timestamp },
  ],
  transactions: [
    { id: 'income', user_id: 'user-1', account_id: 'cash', destination_account_id: null, transaction_type: 'income', amount: 50000, category: 'Revenu', counterparty: null, description: null, occurred_at: '2026-01-04T12:00:00.000Z', is_unplanned: false, created_at: timestamp, updated_at: timestamp },
    { id: 'expense', user_id: 'user-1', account_id: 'cash', destination_account_id: null, transaction_type: 'expense', amount: 10000, category: 'Serveur', counterparty: null, description: null, occurred_at: '2026-01-06T12:00:00.000Z', is_unplanned: false, created_at: timestamp, updated_at: timestamp },
    { id: 'saving', user_id: 'user-1', account_id: 'cash', destination_account_id: 'save', transaction_type: 'savings_deposit', amount: 15000, category: 'Épargne', counterparty: null, description: null, occurred_at: '2026-01-07T12:00:00.000Z', is_unplanned: false, created_at: timestamp, updated_at: timestamp },
  ],
  fixedExpenses: [],
  incomeSources: [{ id: 'salary', user_id: 'user-1', account_id: 'cash', name: 'Revenu', amount: 100000, frequency: 'monthly', next_expected_date: null, probability: 100, is_active: true, notes: null, created_at: timestamp, updated_at: timestamp }],
  savingsExceptions: [],
  unplannedEvents: [],
  savingsGoals: [],
}

describe('financial calculations', () => {
  it('keeps transfers neutral while separating usable and savings balances', () => {
    const balances = calculateAccountBalances(baseData.accounts, baseData.transactions)
    expect(balances.find((account) => account.id === 'cash')?.balance).toBe(125000)
    expect(balances.find((account) => account.id === 'save')?.balance).toBe(35000)
    expect(balances.reduce((sum, account) => sum + account.balance, 0)).toBe(160000)
  })

  it('projects the monthly minimum into savings', () => {
    const result = calculateForecast(baseData, 2026, new Date('2026-01-15T12:00:00.000Z'))
    expect(result.usableBalance).toBe(125000)
    expect(result.savingsBalance).toBe(35000)
    expect(result.months[1]?.projectedSavings).toBe(15000)
    expect(result.projectedYearEndSavings).toBe(200000)
    expect(result.savingsProbability).toBeGreaterThan(0)
  })

  it('does not require savings for a declared extreme exception month', () => {
    const data = {
      ...baseData,
      savingsExceptions: [{ id: 'exception', user_id: 'user-1', exception_year: 2026, exception_month: 2, reason: 'Urgence médicale exceptionnelle', declared_at: timestamp }],
    }
    const result = calculateForecast(data, 2026, new Date('2026-01-15T12:00:00.000Z'))
    expect(result.months[1]?.projectedSavings).toBe(0)
  })
})
