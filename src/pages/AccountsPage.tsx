import { Building2, Landmark, MoreHorizontal, PiggyBank, Plus, Smartphone, Wallet } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { calculateAccountBalances } from '../lib/balances'
import { addAccount, deleteRecord } from '../lib/finance-api'
import { formatMoney } from '../lib/format'
import type { AccountType, FinanceData } from '../types'
import { Alert, ConfirmButton, EmptyState, Field, Form, Modal } from '../components/Ui'

const accountLabels: Record<AccountType, string> = {
  cash: 'Espèces',
  bank: 'Banque',
  mobile_money: 'Mobile Money',
  savings: 'Épargne',
  investment: 'Investissement',
  other: 'Autre',
}

const accountIcons = { cash: Wallet, bank: Landmark, mobile_money: Smartphone, savings: PiggyBank, investment: Building2, other: MoreHorizontal }

export function AccountsPage({
  data,
  refresh,
}: {
  data: FinanceData
  refresh: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const balances = useMemo(() => calculateAccountBalances(data.accounts, data.transactions), [data.accounts, data.transactions])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const accountType = String(form.get('account_type')) as AccountType
    setBusy(true)
    setError(null)
    try {
      await addAccount({
        name: String(form.get('name')).trim(),
        account_type: accountType,
        is_savings: accountType === 'savings' || form.get('is_savings') === 'on',
        opening_balance: Number(form.get('opening_balance')),
        is_active: true,
        notes: String(form.get('notes')).trim() || null,
      })
      setOpen(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ajout impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer ce lieu de stockage ? Les comptes ayant des mouvements doivent être conservés.')) return
    setError(null)
    try {
      await deleteRecord('finance_accounts', id)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression impossible.')
    }
  }

  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Où se trouve l’argent</p><h1>Soldes et comptes</h1><p>Espèces, banques, Mobile Money, épargne et autres réserves.</p></div><button className="button button-primary" onClick={() => setOpen(true)}><Plus size={17} /> Ajouter</button></header>
      {error ? <Alert>{error}</Alert> : null}
      {balances.length ? (
        <section className="account-grid">
          {balances.map((account) => {
            const Icon = accountIcons[account.account_type]
            return (
              <article className="account-card" key={account.id}>
                <div className="account-top"><span className={account.is_savings ? 'account-icon savings' : 'account-icon'}><Icon size={19} /></span><button className="icon-button" aria-label={`Supprimer ${account.name}`} onClick={() => void remove(account.id)}><MoreHorizontal size={18} /></button></div>
                <p>{account.name}</p><strong>{formatMoney(account.balance)}</strong><span>{accountLabels[account.account_type]} {account.is_savings ? '· Protégé' : '· Utilisable'}</span>
              </article>
            )
          })}
        </section>
      ) : <EmptyState title="Aucun solde à suivre" detail="Ajoutez d’abord les endroits où votre argent est conservé." />}

      {open ? (
        <Modal title="Ajouter un compte" onClose={() => setOpen(false)}>
          {error ? <Alert>{error}</Alert> : null}
          <Form onSubmit={submit}>
            <Field label="Nom"><input name="name" required maxLength={100} placeholder="Ex. MTN MoMo principal" /></Field>
            <Field label="Type"><select name="account_type" defaultValue="mobile_money">{Object.entries(accountLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
            <Field label="Solde de départ"><input name="opening_balance" type="number" min="0" step="1" defaultValue="0" required /></Field>
            <label className="check-field"><input name="is_savings" type="checkbox" /> Traiter ce compte comme une épargne protégée</label>
            <Field label="Note"><textarea name="notes" rows={3} maxLength={1000} /></Field>
            <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Annuler</button><ConfirmButton busy={busy}>Ajouter le compte</ConfirmButton></div>
          </Form>
        </Modal>
      ) : null}
    </>
  )
}
