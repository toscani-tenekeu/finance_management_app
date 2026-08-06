import { calculateAccountBalances } from './balances'
import type { FinanceData, Frequency } from '../types'

export interface MonthlyProjection {
  month: number
  actualIncome: number
  actualExpenses: number
  actualSavings: number
  projectedIncome: number
  projectedExpenses: number
  projectedSavings: number
  projectedSavingsBalance: number
  projectedAvailable: number
}

export interface ForecastResult {
  usableBalance: number
  savingsBalance: number
  netWorth: number
  monthlyFixedCommitment: number
  monthlyExpectedIncome: number
  monthlyExpectedUnplanned: number
  runwayMonths: number
  savingsProbability: number
  savingsConsistency: number
  projectedYearEndAvailable: number
  projectedYearEndSavings: number
  riskLevel: 'healthy' | 'watch' | 'critical'
  months: MonthlyProjection[]
  expenseByCategory: Array<{ category: string; amount: number }>
}

const monthlyFactor: Record<Frequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
  one_time: 0,
}

const fixedFactor = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 } as const
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

function isSelectedYear(value: string, year: number): boolean {
  return new Date(value).getFullYear() === year
}

export function calculateForecast(data: FinanceData, year: number, now = new Date()): ForecastResult {
  const balances = calculateAccountBalances(data.accounts, data.transactions)
  const usableBalance = balances
    .filter((account) => !account.is_savings && account.is_active)
    .reduce((sum, account) => sum + account.balance, 0)
  const savingsBalance = balances
    .filter((account) => account.is_savings && account.is_active)
    .reduce((sum, account) => sum + account.balance, 0)

  const activeFixedExpenses = data.fixedExpenses.filter((expense) => expense.is_active)
  const monthlyFixedCommitment = activeFixedExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount) * fixedFactor[expense.frequency],
    0,
  )
  const monthlyExpectedIncome = data.incomeSources
    .filter((source) => source.is_active)
    .reduce((sum, source) => {
      const amount = Number(source.amount) * (source.probability / 100)
      if (source.frequency === 'one_time') return sum
      return sum + amount * monthlyFactor[source.frequency]
    }, 0)

  const anticipatedEvents = data.unplannedEvents.filter((event) => event.status === 'anticipated')
  const undatedEvents = anticipatedEvents.filter((event) => !event.expected_on)
  const remainingMonths = year === now.getFullYear() ? Math.max(1, 11 - now.getMonth()) : 12
  const monthlyExpectedUnplanned = undatedEvents.reduce(
    (sum, event) => sum + (Number(event.estimated_amount) * event.probability) / 100 / remainingMonths,
    0,
  )

  const selectedTransactions = data.transactions.filter((transaction) => isSelectedYear(transaction.occurred_at, year))
  const categoryTotals = new Map<string, number>()
  for (const transaction of selectedTransactions) {
    if (transaction.transaction_type === 'expense') {
      categoryTotals.set(transaction.category, (categoryTotals.get(transaction.category) ?? 0) + Number(transaction.amount))
    }
  }

  const months: MonthlyProjection[] = []
  let projectedAvailable = usableBalance
  let projectedSavings = savingsBalance
  const isCurrentYear = year === now.getFullYear()
  const currentMonth = isCurrentYear ? now.getMonth() : year < now.getFullYear() ? 11 : -1
  const monthlyMinimum = Number(data.profile.monthly_savings_min)

  for (let month = 0; month < 12; month += 1) {
    const transactions = selectedTransactions.filter(
      (transaction) => new Date(transaction.occurred_at).getMonth() === month,
    )
    const actualIncome = transactions
      .filter((transaction) => transaction.transaction_type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
    const actualExpenses = transactions
      .filter((transaction) => transaction.transaction_type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
    const actualSavings = transactions.reduce((sum, transaction) => {
      if (transaction.transaction_type === 'savings_deposit') return sum + Number(transaction.amount)
      if (transaction.transaction_type === 'savings_withdrawal') return sum - Number(transaction.amount)
      return sum
    }, 0)

    const exception = data.savingsExceptions.some(
      (item) => item.exception_year === year && item.exception_month === month + 1,
    )
    const futureMonth = month > currentMonth
    let projectedIncome = actualIncome
    let projectedExpenses = actualExpenses
    let projectedSaving = actualSavings

    if (futureMonth) {
      projectedIncome = monthlyExpectedIncome
      projectedExpenses = monthlyFixedCommitment + monthlyExpectedUnplanned
      projectedSaving = exception ? 0 : monthlyMinimum

      for (const source of data.incomeSources) {
        if (
          source.is_active &&
          source.frequency === 'one_time' &&
          source.next_expected_date &&
          new Date(source.next_expected_date).getFullYear() === year &&
          new Date(source.next_expected_date).getMonth() === month
        ) {
          projectedIncome += Number(source.amount) * (source.probability / 100)
        }
      }

      for (const event of anticipatedEvents) {
        if (
          event.expected_on &&
          new Date(event.expected_on).getFullYear() === year &&
          new Date(event.expected_on).getMonth() === month
        ) {
          projectedExpenses += Number(event.estimated_amount) * (event.probability / 100)
        }
      }

      projectedAvailable += projectedIncome - projectedExpenses - projectedSaving
      projectedSavings += projectedSaving
    }

    months.push({
      month,
      actualIncome,
      actualExpenses,
      actualSavings,
      projectedIncome,
      projectedExpenses,
      projectedSavings: projectedSaving,
      projectedSavingsBalance: projectedSavings,
      projectedAvailable,
    })
  }

  const elapsedMonths = year === now.getFullYear() ? now.getMonth() + 1 : year < now.getFullYear() ? 12 : 0
  const eligibleMonths = Array.from({ length: elapsedMonths }, (_, month) => month + 1).filter(
    (month) =>
      !data.savingsExceptions.some(
        (exception) => exception.exception_year === year && exception.exception_month === month,
      ),
  )
  const successfulMonths = eligibleMonths.filter((month) => (months[month - 1]?.actualSavings ?? 0) >= monthlyMinimum)
  const savingsConsistency = eligibleMonths.length === 0 ? 100 : (successfulMonths.length / eligibleMonths.length) * 100

  const monthlyObligations = monthlyFixedCommitment + monthlyExpectedUnplanned + monthlyMinimum
  const runwayMonths = monthlyObligations > 0 ? Math.max(0, usableBalance / monthlyObligations) : 99
  const coverageScore = clamp((runwayMonths / Math.max(1, Number(data.profile.emergency_reserve_months))) * 100, 0, 100)
  const cashflowScore = monthlyObligations > 0 ? clamp((monthlyExpectedIncome / monthlyObligations) * 100, 0, 100) : 100
  const dataScore = clamp((selectedTransactions.length / 24) * 100 + (data.incomeSources.length > 0 ? 25 : 0), 20, 100)
  const savingsProbability = Math.round(
    clamp(savingsConsistency * 0.4 + coverageScore * 0.3 + cashflowScore * 0.2 + dataScore * 0.1, 0, 100),
  )

  const projectedYearEndAvailable = months.at(-1)?.projectedAvailable ?? usableBalance
  const projectedYearEndSavings = projectedSavings
  const riskLevel =
    projectedYearEndAvailable < 0 || runwayMonths < 1 || savingsProbability < 40
      ? 'critical'
      : runwayMonths < Number(data.profile.emergency_reserve_months) || savingsProbability < 70
        ? 'watch'
        : 'healthy'

  return {
    usableBalance,
    savingsBalance,
    netWorth: usableBalance + savingsBalance,
    monthlyFixedCommitment,
    monthlyExpectedIncome,
    monthlyExpectedUnplanned,
    runwayMonths,
    savingsProbability,
    savingsConsistency,
    projectedYearEndAvailable,
    projectedYearEndSavings,
    riskLevel,
    months,
    expenseByCategory: [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount),
  }
}
