import { AlertTriangle, CalendarX2, Flag, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert, ConfirmButton, EmptyState, Field, Form, Modal } from '../components/Ui'
import { addSavingsException, addSavingsGoal, addUnplannedEvent, deleteRecord, updateProfile } from '../lib/finance-api'
import { formatDate, formatMoney, monthLabels } from '../lib/format'
import type { ForecastResult } from '../lib/forecast'
import type { FinanceData } from '../types'

export function SavingsPage({ data, forecast, year, refresh }: { data: FinanceData; forecast: ForecastResult; year: number; refresh: () => Promise<void> }) {
  const [modal, setModal] = useState<'exception' | 'event' | 'goal' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveMinimum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null)
    try { await updateProfile({ display_name: data.profile.display_name, monthly_savings_min: Number(form.get('monthly_savings_min')), emergency_reserve_months: Number(form.get('emergency_reserve_months')) }); await refresh(); setMessage('Règles d’épargne mises à jour.') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Mise à jour impossible.') } finally { setBusy(false) }
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null)
    try { await addSavingsException({ exception_year: Number(form.get('year')), exception_month: Number(form.get('month')), reason: String(form.get('reason')).trim() }); setModal(null); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Déclaration impossible.') } finally { setBusy(false) }
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const expected = String(form.get('expected_on')); setBusy(true); setError(null)
    try { await addUnplannedEvent({ transaction_id: null, name: String(form.get('name')).trim(), estimated_amount: Number(form.get('amount')), probability: Number(form.get('probability')), expected_on: expected || null, status: 'anticipated', notes: String(form.get('notes')).trim() || null }); setModal(null); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ajout impossible.') } finally { setBusy(false) }
  }

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null)
    try { await addSavingsGoal({ name: String(form.get('name')).trim(), target_amount: Number(form.get('target_amount')), target_date: String(form.get('target_date')), priority: Number(form.get('priority')), status: 'active', notes: String(form.get('notes')).trim() || null }); setModal(null); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ajout impossible.') } finally { setBusy(false) }
  }

  async function remove(table: 'finance_savings_exceptions' | 'finance_unplanned_events' | 'finance_savings_goals', id: string) {
    if (!window.confirm('Supprimer cet élément ?')) return
    try { await deleteRecord(table, id); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.') }
  }

  const currentGoal = data.savingsGoals.find((goal) => goal.status === 'active')
  const progress = currentGoal ? Math.min(100, (forecast.savingsBalance / currentGoal.target_amount) * 100) : 0

  return <>
    <header className="page-heading"><div><p className="eyebrow">Discipline et protection</p><h1>Épargne et imprévus</h1><p>Minimum obligatoire de 15 000 XAF par mois, objectifs et exceptions justifiées.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => setModal('event')}><AlertTriangle size={16} /> Imprévu</button><button className="button button-primary" onClick={() => setModal('goal')}><Plus size={16} /> Objectif</button></div></header>
    {error ? <Alert>{error}</Alert> : null}{message ? <Alert tone="success">{message}</Alert> : null}
    <section className="savings-hero"><div className="savings-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><div><PiggyBank size={22} /><strong>{Math.round(progress)}%</strong></div></div><div><p>Épargne actuelle</p><h2>{formatMoney(forecast.savingsBalance)}</h2><span>{currentGoal ? `${formatMoney(currentGoal.target_amount)} visés avant le ${formatDate(currentGoal.target_date)}` : 'Ajoutez un objectif pour suivre la progression.'}</span></div><div className="savings-hero-stat"><span>Régularité {year}</span><strong>{Math.round(forecast.savingsConsistency)}%</strong></div></section>
    <section className="dashboard-grid">
      <article className="panel"><div className="panel-heading"><div><h2>Règles mensuelles</h2><p>Le minimum ne peut jamais être inférieur à 15 000 XAF.</p></div></div><Form onSubmit={saveMinimum}><Field label="Minimum mensuel (XAF)"><input name="monthly_savings_min" type="number" min="15000" step="1" defaultValue={data.profile.monthly_savings_min} required /></Field><Field label="Réserve souhaitée (mois de charges)"><input name="emergency_reserve_months" type="number" min="0" max="60" step="0.5" defaultValue={data.profile.emergency_reserve_months} required /></Field><ConfirmButton busy={busy}>Enregistrer les règles</ConfirmButton></Form></article>
      <article className="panel panel-wide"><div className="panel-heading"><div><h2>Exceptions extrêmes</h2><p>Chaque mois sans épargne doit être déclaré avec son motif.</p></div><button className="tiny-button" onClick={() => setModal('exception')}><Plus size={14} /> Déclarer</button></div>{data.savingsExceptions.length ? <div className="item-list compact">{data.savingsExceptions.map((item) => <article className="list-card" key={item.id}><span className="list-icon red"><CalendarX2 size={18} /></span><div><strong>{monthLabels[item.exception_month - 1]} {item.exception_year}</strong><p>{item.reason}</p></div><button className="icon-button danger" onClick={() => void remove('finance_savings_exceptions', item.id)}><Trash2 size={15} /></button></article>)}</div> : <EmptyState title="Aucune exception" detail="C’est une bonne nouvelle : aucun mois non épargné n’a été déclaré." />}</article>
      <article className="panel"><div className="panel-heading"><div><h2>Imprévus anticipés</h2><p>Coût probable intégré aux prévisions.</p></div></div>{data.unplannedEvents.length ? <div className="item-list compact">{data.unplannedEvents.map((item) => <article className="list-card" key={item.id}><span className="list-icon amber"><AlertTriangle size={18} /></span><div><strong>{item.name}</strong><p>{formatMoney(item.estimated_amount)} · probabilité {item.probability}%</p></div><button className="icon-button danger" onClick={() => void remove('finance_unplanned_events', item.id)}><Trash2 size={15} /></button></article>)}</div> : <EmptyState title="Aucun imprévu anticipé" detail="Ajoutez les risques connus pour tester votre marge réelle." />}</article>
      <article className="panel panel-wide"><div className="panel-heading"><div><h2>Objectifs</h2><p>Priorisez ce que votre épargne doit financer.</p></div></div>{data.savingsGoals.length ? <div className="goal-grid">{data.savingsGoals.map((goal) => <article className="goal-card" key={goal.id}><Flag size={18} /><div><strong>{goal.name}</strong><p>{formatMoney(goal.target_amount)} avant le {formatDate(goal.target_date)}</p><small>Priorité {goal.priority} · {goal.status === 'active' ? 'Actif' : goal.status}</small></div><button className="icon-button danger" onClick={() => void remove('finance_savings_goals', goal.id)}><Trash2 size={15} /></button></article>)}</div> : <EmptyState title="Aucun objectif" detail="Créez un objectif concret pour donner une destination à l’épargne." />}</article>
    </section>
    {modal === 'exception' ? <Modal title="Déclarer une exception extrême" onClose={() => setModal(null)}>{error ? <Alert>{error}</Alert> : null}<Alert tone="info">Cette déclaration retire le mois du calcul d’obligation, mais reste visible dans l’historique.</Alert><Form onSubmit={addException}><div className="form-grid"><Field label="Année"><input name="year" type="number" min="2000" max="2100" defaultValue={year} required /></Field><Field label="Mois"><select name="month" defaultValue={new Date().getMonth() + 1}>{monthLabels.map((label, index) => <option value={index + 1} key={label}>{label}</option>)}</select></Field></div><Field label="Motif de nécessité extrême"><textarea name="reason" minLength={10} maxLength={1000} rows={4} required /></Field><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Annuler</button><ConfirmButton busy={busy} tone="danger">Déclarer l’exception</ConfirmButton></div></Form></Modal> : null}
    {modal === 'event' ? <Modal title="Anticiper un imprévu" onClose={() => setModal(null)}><Form onSubmit={addEvent}><Field label="Risque ou besoin"><input name="name" required maxLength={120} /></Field><div className="form-grid"><Field label="Montant estimé (XAF)"><input name="amount" type="number" min="1" required /></Field><Field label="Probabilité (%)"><input name="probability" type="number" min="0" max="100" defaultValue="50" required /></Field></div><Field label="Date probable"><input name="expected_on" type="date" /></Field><Field label="Notes"><textarea name="notes" rows={3} /></Field><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Annuler</button><ConfirmButton busy={busy}>Ajouter</ConfirmButton></div></Form></Modal> : null}
    {modal === 'goal' ? <Modal title="Créer un objectif d’épargne" onClose={() => setModal(null)}><Form onSubmit={addGoal}><Field label="Objectif"><input name="name" required maxLength={120} /></Field><div className="form-grid"><Field label="Montant cible (XAF)"><input name="target_amount" type="number" min="1" required /></Field><Field label="Échéance"><input name="target_date" type="date" required /></Field></div><Field label="Priorité"><select name="priority" defaultValue="2"><option value="1">1 — Haute</option><option value="2">2 — Normale</option><option value="3">3 — Faible</option></select></Field><Field label="Notes"><textarea name="notes" rows={3} /></Field><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Annuler</button><ConfirmButton busy={busy}>Créer</ConfirmButton></div></Form></Modal> : null}
  </>
}
