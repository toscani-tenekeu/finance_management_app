import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Alert, ConfirmButton, EmptyState, Field, Form, Modal } from '../components/Ui'
import { addTransaction, deleteRecord } from '../lib/finance-api'
import { formatDate, formatMoney, toDateInput } from '../lib/format'
import type { FinanceData, TransactionType } from '../types'

const typeLabels: Record<TransactionType, string> = {
  income: 'Entrée',
  expense: 'Sortie',
  transfer: 'Transfert',
  savings_deposit: 'Dépôt en épargne',
  savings_withdrawal: 'Retrait d’épargne',
}

export function TransactionsPage({ data, year, refresh }: { data: FinanceData; year: number; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const transactions = useMemo(
    () => data.transactions.filter((transaction) => new Date(transaction.occurred_at).getFullYear() === year),
    [data.transactions, year],
  )
  const needsDestination = ['transfer', 'savings_deposit', 'savings_withdrawal'].includes(transactionType)
  const sourceAccounts = data.accounts.filter((account) => {
    if (transactionType === 'savings_deposit') return !account.is_savings
    if (transactionType === 'savings_withdrawal') return account.is_savings
    return account.is_active
  })
  const destinationAccounts = data.accounts.filter((account) => {
    if (transactionType === 'savings_deposit') return account.is_savings
    if (transactionType === 'savings_withdrawal') return !account.is_savings
    return account.is_active
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await addTransaction({
        account_id: String(form.get('account_id')),
        destination_account_id: needsDestination ? String(form.get('destination_account_id')) : null,
        transaction_type: transactionType,
        amount: Number(form.get('amount')),
        category: String(form.get('category')).trim(),
        counterparty: String(form.get('counterparty')).trim() || null,
        description: String(form.get('description')).trim() || null,
        occurred_at: `${String(form.get('occurred_at'))}T12:00:00.000Z`,
        is_unplanned: form.get('is_unplanned') === 'on',
      })
      setOpen(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer définitivement ce mouvement ?')) return
    try {
      await deleteRecord('finance_transactions', id)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression impossible.')
    }
  }

  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Chaque entrée et sortie</p><h1>Mouvements · {year}</h1><p>Déclarez chaque utilisation d’argent afin de garder des soldes fiables.</p></div><button className="button button-primary" onClick={() => setOpen(true)} disabled={!data.accounts.length}><Plus size={17} /> Déclarer</button></header>
      {error ? <Alert>{error}</Alert> : null}
      {!data.accounts.length ? <Alert tone="info">Ajoutez au moins un compte avant de déclarer un mouvement.</Alert> : null}
      {transactions.length ? (
        <section className="panel table-panel">
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Détail</th><th>Catégorie</th><th className="number">Montant</th><th /></tr></thead><tbody>
            {transactions.map((transaction) => {
              const isIncome = transaction.transaction_type === 'income'
              const isExpense = transaction.transaction_type === 'expense'
              const Icon = isIncome ? ArrowDownLeft : isExpense ? ArrowUpRight : transaction.transaction_type.includes('savings') ? PiggyBank : ArrowLeftRight
              return <tr key={transaction.id}><td>{formatDate(transaction.occurred_at)}</td><td><span className={`transaction-type type-${transaction.transaction_type}`}><Icon size={15} />{typeLabels[transaction.transaction_type]}</span></td><td><strong>{transaction.counterparty || transaction.description || 'Sans détail'}</strong>{transaction.is_unplanned ? <small>Imprévu déclaré</small> : null}</td><td>{transaction.category}</td><td className={`number amount-${isIncome ? 'positive' : isExpense ? 'negative' : 'neutral'}`}>{isIncome ? '+' : isExpense ? '−' : ''}{formatMoney(transaction.amount)}</td><td><button className="icon-button danger" aria-label="Supprimer" onClick={() => void remove(transaction.id)}><Trash2 size={16} /></button></td></tr>
            })}
          </tbody></table></div>
        </section>
      ) : <EmptyState title="Aucun mouvement pour cette année" detail="Déclarez une entrée, une sortie ou un transfert pour démarrer le suivi." />}

      {open ? <Modal title="Déclarer un mouvement" onClose={() => setOpen(false)}>
        {error ? <Alert>{error}</Alert> : null}
        <Form onSubmit={submit}>
          <div className="form-grid"><Field label="Type"><select value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Date"><input name="occurred_at" type="date" defaultValue={toDateInput()} required /></Field></div>
          <Field label={transactionType === 'income' ? 'Compte crédité' : 'Compte source'}><select name="account_id" required>{sourceAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field>
          {needsDestination ? <Field label="Compte de destination"><select name="destination_account_id" required>{destinationAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field> : null}
          <div className="form-grid"><Field label="Montant (XAF)"><input name="amount" type="number" min="1" step="1" required /></Field><Field label="Catégorie"><input name="category" defaultValue={transactionType === 'income' ? 'Revenu' : transactionType.includes('savings') ? 'Épargne' : 'Autre'} required maxLength={80} /></Field></div>
          <Field label="Personne, service ou origine"><input name="counterparty" maxLength={120} placeholder="Ex. DirectAdmin, Client A" /></Field>
          <Field label="Détails" hint={transactionType === 'savings_withdrawal' ? 'Motif obligatoire, au moins 10 caractères.' : undefined}><textarea name="description" rows={3} minLength={transactionType === 'savings_withdrawal' ? 10 : undefined} required={transactionType === 'savings_withdrawal'} maxLength={1000} /></Field>
          <label className="check-field"><input name="is_unplanned" type="checkbox" /> Cette sortie était imprévue</label>
          <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Annuler</button><ConfirmButton busy={busy}>Enregistrer</ConfirmButton></div>
        </Form>
      </Modal> : null}
    </>
  )
}
