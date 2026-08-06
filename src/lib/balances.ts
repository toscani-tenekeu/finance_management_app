import type { Account, FinanceTransaction } from '../types'

export interface AccountBalance extends Account {
  balance: number
}

export function calculateAccountBalances(
  accounts: Account[],
  transactions: FinanceTransaction[],
): AccountBalance[] {
  const balances = new Map(accounts.map((account) => [account.id, Number(account.opening_balance)]))

  for (const transaction of transactions) {
    const amount = Number(transaction.amount)
    if (transaction.transaction_type === 'income') {
      balances.set(transaction.account_id, (balances.get(transaction.account_id) ?? 0) + amount)
    } else if (transaction.transaction_type === 'expense') {
      balances.set(transaction.account_id, (balances.get(transaction.account_id) ?? 0) - amount)
    } else {
      balances.set(transaction.account_id, (balances.get(transaction.account_id) ?? 0) - amount)
      if (transaction.destination_account_id) {
        balances.set(
          transaction.destination_account_id,
          (balances.get(transaction.destination_account_id) ?? 0) + amount,
        )
      }
    }
  }

  return accounts.map((account) => ({ ...account, balance: balances.get(account.id) ?? 0 }))
}
