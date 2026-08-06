import type {
  Account,
  AppUser,
  FinanceData,
  FinanceTransaction,
  FixedExpense,
  IncomeSource,
  Profile,
  SavingsException,
  SavingsGoal,
  UnplannedEvent,
} from '../types'

type CreateAccount = Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>
type CreateTransaction = Omit<FinanceTransaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>
type CreateFixedExpense = Omit<FixedExpense, 'id' | 'user_id' | 'created_at' | 'updated_at'>
type CreateIncomeSource = Omit<IncomeSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>
type CreateSavingsException = Omit<SavingsException, 'id' | 'user_id' | 'declared_at'>
type CreateUnplannedEvent = Omit<UnplannedEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>
type CreateSavingsGoal = Omit<SavingsGoal, 'id' | 'user_id' | 'created_at' | 'updated_at'>

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `Erreur HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getCurrentUser(): Promise<{ user: AppUser | null }> {
  return api('/api/auth/me')
}

export function login(username: string, password: string): Promise<{ user: AppUser }> {
  return api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function logout(): Promise<{ user: null }> {
  return api('/api/auth/logout', { method: 'POST' })
}

export function loadFinanceData(): Promise<FinanceData> {
  return api('/api/finance')
}

export function addAccount(payload: CreateAccount): Promise<{ id: string }> {
  return api('/api/finance/accounts', { method: 'POST', body: JSON.stringify(payload) })
}

export function addTransaction(payload: CreateTransaction): Promise<{ id: string }> {
  return api('/api/finance/transactions', { method: 'POST', body: JSON.stringify(payload) })
}

export function addFixedExpense(payload: CreateFixedExpense): Promise<{ id: string }> {
  return api('/api/finance/fixed-expenses', { method: 'POST', body: JSON.stringify(payload) })
}

export function addIncomeSource(payload: CreateIncomeSource): Promise<{ id: string }> {
  return api('/api/finance/income-sources', { method: 'POST', body: JSON.stringify(payload) })
}

export function addSavingsException(payload: CreateSavingsException): Promise<{ id: string }> {
  return api('/api/finance/savings-exceptions', { method: 'POST', body: JSON.stringify(payload) })
}

export function addUnplannedEvent(payload: CreateUnplannedEvent): Promise<{ id: string }> {
  return api('/api/finance/unplanned-events', { method: 'POST', body: JSON.stringify(payload) })
}

export function addSavingsGoal(payload: CreateSavingsGoal): Promise<{ id: string }> {
  return api('/api/finance/savings-goals', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateProfile(
  changes: Pick<Profile, 'display_name' | 'monthly_savings_min' | 'emergency_reserve_months'>,
): Promise<{ ok: true }> {
  return api('/api/finance/profile', { method: 'PATCH', body: JSON.stringify(changes) })
}

const resourcePaths = {
  finance_accounts: 'accounts',
  finance_transactions: 'transactions',
  finance_fixed_expenses: 'fixed-expenses',
  finance_income_sources: 'income-sources',
  finance_savings_exceptions: 'savings-exceptions',
  finance_unplanned_events: 'unplanned-events',
  finance_savings_goals: 'savings-goals',
} as const

export function deleteRecord(table: keyof typeof resourcePaths, id: string): Promise<void> {
  return api(`/api/finance/${resourcePaths[table]}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function markFixedExpensePaid(expenseId: string, paidOn: string): Promise<{ id: string }> {
  return api(`/api/finance/fixed-expenses/${encodeURIComponent(expenseId)}/pay`, {
    method: 'POST',
    body: JSON.stringify({ paid_on: paidOn }),
  })
}

export function listUsers(): Promise<{ users: AppUser[] }> {
  return api('/api/users')
}

export function createUser(payload: { username: string; displayName: string | null; password?: string }): Promise<{
  user: AppUser
  generatedPassword: string | null
}> {
  return api('/api/users', { method: 'POST', body: JSON.stringify(payload) })
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return api('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function downloadOwnBackup(password: string, passphrase: string): Promise<void> {
  const response = await fetch('/api/account/backup', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, passphrase }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? 'Sauvegarde impossible.')
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'finance-user.fmbak'
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function deleteOwnAccount(password: string): Promise<{ deleted: true }> {
  return api('/api/account', {
    method: 'DELETE',
    body: JSON.stringify({ password, confirmation: 'SUPPRIMER' }),
  })
}
