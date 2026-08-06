import { z } from 'zod'

const shortText = (maximum) => z.string().trim().min(1).max(maximum)
const optionalText = (maximum) => z.string().trim().max(maximum).optional().nullable().transform((value) => value || null)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const dateTime = z.string().datetime({ offset: true })
const amount = z.number().int().positive().max(9_000_000_000_000)

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(1).max(256),
})

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(32),
  displayName: optionalText(100),
  password: z.string().min(12).max(256).optional(),
})

export const accountSchema = z.object({
  name: shortText(100),
  account_type: z.enum(['cash', 'bank', 'mobile_money', 'savings', 'investment', 'other']),
  is_savings: z.boolean(),
  opening_balance: z.number().int().nonnegative().max(9_000_000_000_000),
  is_active: z.boolean().default(true),
  notes: optionalText(1000),
})

export const transactionSchema = z.object({
  account_id: z.uuid(),
  destination_account_id: z.uuid().nullable(),
  transaction_type: z.enum(['income', 'expense', 'transfer', 'savings_deposit', 'savings_withdrawal']),
  amount,
  category: shortText(80),
  counterparty: optionalText(120),
  description: optionalText(1000),
  occurred_at: dateTime,
  is_unplanned: z.boolean().default(false),
})

export const fixedExpenseSchema = z.object({
  account_id: z.uuid().nullable(),
  name: shortText(120),
  category: shortText(80),
  amount,
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  next_due_date: date,
  is_active: z.boolean().default(true),
  notes: optionalText(1000),
})

export const incomeSourceSchema = z.object({
  account_id: z.uuid().nullable(),
  name: shortText(120),
  amount,
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'one_time']),
  next_expected_date: date.nullable(),
  probability: z.number().int().min(0).max(100),
  is_active: z.boolean().default(true),
  notes: optionalText(1000),
})

export const savingsExceptionSchema = z.object({
  exception_year: z.number().int().min(2000).max(2100),
  exception_month: z.number().int().min(1).max(12),
  reason: z.string().trim().min(10).max(1000),
})

export const unplannedEventSchema = z.object({
  transaction_id: z.uuid().nullable(),
  name: shortText(120),
  estimated_amount: amount,
  probability: z.number().int().min(0).max(100),
  expected_on: date.nullable(),
  status: z.enum(['anticipated', 'occurred', 'dismissed']),
  notes: optionalText(1000),
})

export const savingsGoalSchema = z.object({
  name: shortText(120),
  target_amount: amount,
  target_date: date,
  priority: z.number().int().min(1).max(3),
  status: z.enum(['active', 'completed', 'paused']),
  notes: optionalText(1000),
})

export const profileSchema = z.object({
  display_name: optionalText(100),
  monthly_savings_min: z.number().int().min(15000).max(9_000_000_000_000),
  emergency_reserve_months: z.number().min(0).max(60),
})

export const payFixedSchema = z.object({ paid_on: date })

export function validationMessage(error) {
  return error.issues?.[0]?.message ?? 'Données invalides.'
}
