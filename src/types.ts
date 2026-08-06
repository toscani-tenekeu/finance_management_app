export type AccountType = 'cash' | 'bank' | 'mobile_money' | 'savings' | 'investment' | 'other'
export type TransactionType = 'income' | 'expense' | 'transfer' | 'savings_deposit' | 'savings_withdrawal'
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time'
export type FixedFrequency = 'monthly' | 'quarterly' | 'yearly'

export interface AppUser {
  id: string
  username: string
  displayName: string | null
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt: string | null
}

export interface Profile {
  user_id: string
  display_name: string | null
  currency: 'XAF'
  monthly_savings_min: number
  emergency_reserve_months: number
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  account_type: AccountType
  is_savings: boolean
  opening_balance: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinanceTransaction {
  id: string
  user_id: string
  account_id: string
  destination_account_id: string | null
  transaction_type: TransactionType
  amount: number
  category: string
  counterparty: string | null
  description: string | null
  occurred_at: string
  is_unplanned: boolean
  created_at: string
  updated_at: string
}

export interface FixedExpense {
  id: string
  user_id: string
  account_id: string | null
  name: string
  category: string
  amount: number
  frequency: FixedFrequency
  next_due_date: string
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface IncomeSource {
  id: string
  user_id: string
  account_id: string | null
  name: string
  amount: number
  frequency: Frequency
  next_expected_date: string | null
  probability: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SavingsException {
  id: string
  user_id: string
  exception_year: number
  exception_month: number
  reason: string
  declared_at: string
}

export interface UnplannedEvent {
  id: string
  user_id: string
  transaction_id: string | null
  name: string
  estimated_amount: number
  probability: number
  expected_on: string | null
  status: 'anticipated' | 'occurred' | 'dismissed'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SavingsGoal {
  id: string
  user_id: string
  name: string
  target_amount: number
  target_date: string
  priority: number
  status: 'active' | 'completed' | 'paused'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinanceData {
  profile: Profile
  accounts: Account[]
  transactions: FinanceTransaction[]
  fixedExpenses: FixedExpense[]
  incomeSources: IncomeSource[]
  savingsExceptions: SavingsException[]
  unplannedEvents: UnplannedEvent[]
  savingsGoals: SavingsGoal[]
}
