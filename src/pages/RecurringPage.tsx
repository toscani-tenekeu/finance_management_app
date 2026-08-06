import { CalendarCheck, CircleDollarSign, Plus, Receipt, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert, ConfirmButton, EmptyState, Field, Form, Modal } from '../components/Ui'
import { addFixedExpense, addIncomeSource, deleteRecord, markFixedExpensePaid } from '../lib/finance-api'
import { formatDate, formatMoney, toDateInput } from '../lib/format'
import type { FinanceData, FixedFrequency, Frequency } from '../types'

const frequencyLabels: Record<Frequency, string> = {
  weekly: 'Chaque semaine', biweekly: 'Toutes les 2 semaines', monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année', one_time: 'Une seule fois',
}

export function RecurringPage({ data, refresh }: { data: FinanceData; refresh: () => Promise<void> }) {
  const [modal, setModal] = useState<'fixed' | 'income' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function addFixed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(null)
    try {
      await addFixedExpense({
        account_id: String(form.get('account_id')) || null,
        name: String(form.get('name')).trim(),
        category: String(form.get('category')).trim(),
        amount: Number(form.get('amount')),
        frequency: String(form.get('frequency')) as FixedFrequency,
        next_due_date: String(form.get('next_due_date')),
        is_active: true,
        notes: String(form.get('notes')).trim() || null,
      })
      setModal(null); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ajout impossible.') } finally { setBusy(false) }
  }

  async function addIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expectedDate = String(form.get('next_expected_date'))
    setBusy(true); setError(null)
    try {
      await addIncomeSource({
        account_id: String(form.get('account_id')) || null,
        name: String(form.get('name')).trim(),
        amount: Number(form.get('amount')),
        frequency: String(form.get('frequency')) as Frequency,
        next_expected_date: expectedDate || null,
        probability: Number(form.get('probability')),
        is_active: true,
        notes: String(form.get('notes')).trim() || null,
      })
      setModal(null); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ajout impossible.') } finally { setBusy(false) }
  }

  async function remove(table: 'finance_fixed_expenses' | 'finance_income_sources', id: string) {
    if (!window.confirm('Supprimer cet élément récurrent ?')) return
    try { await deleteRecord(table, id); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.') }
  }

  async function pay(id: string) {
    const paidOn = window.prompt('Date du paiement (AAAA-MM-JJ)', toDateInput())
    if (!paidOn) return
    try { await markFixedExpensePaid(id, paidOn); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Paiement impossible.') }
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">Ce qui revient régulièrement</p><h1>Revenus et dépenses fixes</h1><p>Abonnements, serveurs, loyers et sources de revenus attendues.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => setModal('income')}><Plus size={17} /> Revenu</button><button className="button button-primary" onClick={() => setModal('fixed')}><Plus size={17} /> Dépense fixe</button></div></header>
    {error ? <Alert>{error}</Alert> : null}
    <section className="split-sections">
      <div><div className="section-title"><div><h2>Dépenses fixes</h2><p>{formatMoney(data.fixedExpenses.filter((item) => item.is_active).reduce((sum, item) => sum + item.amount * (item.frequency === 'monthly' ? 1 : item.frequency === 'quarterly' ? 1 / 3 : 1 / 12), 0))} / mois estimé</p></div></div>
        {data.fixedExpenses.length ? <div className="item-list">{data.fixedExpenses.map((expense) => <article className="list-card" key={expense.id}><span className="list-icon amber"><Receipt size={18} /></span><div><strong>{expense.name}</strong><p>{expense.category} · {frequencyLabels[expense.frequency]}</p><small>Prochaine échéance : {formatDate(expense.next_due_date)}</small></div><div className="list-value"><strong>{formatMoney(expense.amount)}</strong><div><button className="tiny-button" onClick={() => void pay(expense.id)} disabled={!expense.account_id}><CalendarCheck size={14} /> Payée</button><button className="icon-button danger" onClick={() => void remove('finance_fixed_expenses', expense.id)}><Trash2 size={15} /></button></div></div></article>)}</div> : <EmptyState title="Aucune dépense fixe" detail="Ajoutez DirectAdmin, vos VPS ou toute obligation récurrente." />}
      </div>
      <div><div className="section-title"><div><h2>Sources de revenus</h2><p>Montants pondérés par leur probabilité</p></div></div>
        {data.incomeSources.length ? <div className="item-list">{data.incomeSources.map((source) => <article className="list-card" key={source.id}><span className="list-icon green"><CircleDollarSign size={18} /></span><div><strong>{source.name}</strong><p>{frequencyLabels[source.frequency]} · confiance {source.probability}%</p><small>{source.next_expected_date ? `Prochaine entrée : ${formatDate(source.next_expected_date)}` : 'Date flexible'}</small></div><div className="list-value"><strong>{formatMoney(source.amount)}</strong><button className="icon-button danger" onClick={() => void remove('finance_income_sources', source.id)}><Trash2 size={15} /></button></div></article>)}</div> : <EmptyState title="Aucun revenu prévu" detail="Déclarez vos sources pour rendre les prévisions plus pertinentes." />}
      </div>
    </section>

    {modal === 'fixed' ? <Modal title="Ajouter une dépense fixe" onClose={() => setModal(null)}>{error ? <Alert>{error}</Alert> : null}<Form onSubmit={addFixed}><Field label="Nom"><input name="name" required maxLength={120} placeholder="Ex. VPS 8 GB RAM — serveur 1" /></Field><div className="form-grid"><Field label="Montant (XAF)"><input name="amount" type="number" min="1" step="1" required /></Field><Field label="Fréquence"><select name="frequency" defaultValue="monthly"><option value="monthly">Chaque mois</option><option value="quarterly">Chaque trimestre</option><option value="yearly">Chaque année</option></select></Field></div><div className="form-grid"><Field label="Catégorie"><input name="category" defaultValue="Abonnement" required /></Field><Field label="Prochaine échéance"><input name="next_due_date" type="date" defaultValue={toDateInput()} required /></Field></div><Field label="Compte payé"><select name="account_id"><option value="">À définir plus tard</option>{data.accounts.filter((item) => !item.is_savings).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="Notes"><textarea name="notes" rows={3} /></Field><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Annuler</button><ConfirmButton busy={busy}>Ajouter</ConfirmButton></div></Form></Modal> : null}
    {modal === 'income' ? <Modal title="Ajouter une source de revenus" onClose={() => setModal(null)}>{error ? <Alert>{error}</Alert> : null}<Form onSubmit={addIncome}><Field label="Nom"><input name="name" required maxLength={120} placeholder="Ex. Revenus KmerHosting" /></Field><div className="form-grid"><Field label="Montant attendu (XAF)"><input name="amount" type="number" min="1" step="1" required /></Field><Field label="Fréquence"><select name="frequency" defaultValue="monthly">{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><div className="form-grid"><Field label="Probabilité (%)"><input name="probability" type="number" min="0" max="100" defaultValue="100" required /></Field><Field label="Prochaine date"><input name="next_expected_date" type="date" /></Field></div><Field label="Compte crédité"><select name="account_id"><option value="">Non défini</option>{data.accounts.filter((item) => !item.is_savings).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="Notes"><textarea name="notes" rows={3} /></Field><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Annuler</button><ConfirmButton busy={busy}>Ajouter</ConfirmButton></div></Form></Modal> : null}
  </>
}
