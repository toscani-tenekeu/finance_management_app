import { Download, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Alert, ConfirmButton, Field, Form } from '../components/Ui'
import { changePassword, createUser, deleteOwnAccount, downloadOwnBackup, listUsers, updateProfile } from '../lib/finance-api'
import { formatDate } from '../lib/format'
import type { AppUser, FinanceData } from '../types'

export function SettingsPage({
  currentUser,
  data,
  refresh,
  onAccountDeleted,
}: {
  currentUser: AppUser
  data: FinanceData
  refresh: () => Promise<void>
  onAccountDeleted: () => void
}) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (currentUser.role === 'admin') {
      void listUsers().then((result) => setUsers(result.users)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Liste des utilisateurs indisponible.'))
    }
  }, [currentUser.role])

  function start() { setBusy(true); setError(null); setMessage(null) }
  function fail(reason: unknown, fallback: string) { setError(reason instanceof Error ? reason.message : fallback) }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); start()
    try { await updateProfile({ display_name: String(form.get('display_name')).trim() || null, monthly_savings_min: data.profile.monthly_savings_min, emergency_reserve_months: data.profile.emergency_reserve_months }); await refresh(); setMessage('Profil mis à jour.') } catch (reason) { fail(reason, 'Mise à jour impossible.') } finally { setBusy(false) }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const next = String(form.get('newPassword')); start()
    if (next !== String(form.get('confirmation'))) { setBusy(false); setError('Les deux nouveaux mots de passe sont différents.'); return }
    try { await changePassword(String(form.get('currentPassword')), next); event.currentTarget.reset(); setMessage('Mot de passe modifié. Les autres sessions ont été fermées.') } catch (reason) { fail(reason, 'Modification impossible.') } finally { setBusy(false) }
  }

  async function backup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const passphrase = String(form.get('passphrase')); start()
    if (passphrase !== String(form.get('passphraseConfirmation'))) { setBusy(false); setError('Les phrases secrètes sont différentes.'); return }
    try { await downloadOwnBackup(String(form.get('password')), passphrase); event.currentTarget.reset(); setMessage('Sauvegarde chiffrée téléchargée.') } catch (reason) { fail(reason, 'Sauvegarde impossible.') } finally { setBusy(false) }
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); start(); setGeneratedPassword(null)
    try {
      const password = String(form.get('password')).trim()
      const result = await createUser({ username: String(form.get('username')).trim(), displayName: String(form.get('displayName')).trim() || null, ...(password ? { password } : {}) })
      setGeneratedPassword(result.generatedPassword)
      setUsers((current) => [...current, result.user])
      event.currentTarget.reset()
      setMessage('Utilisateur créé.')
    } catch (reason) { fail(reason, 'Création impossible.') } finally { setBusy(false) }
  }

  async function removeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    if (String(form.get('confirmation')) !== 'SUPPRIMER') { setError('Tapez exactement SUPPRIMER.'); return }
    if (!window.confirm('Dernière confirmation : supprimer ce compte et toutes ses données ?')) return
    start()
    try { await deleteOwnAccount(String(form.get('password'))); onAccountDeleted() } catch (reason) { fail(reason, 'Suppression impossible.'); setBusy(false) }
  }

  return <>
    <header className="page-heading"><div><p className="eyebrow">Compte et installation</p><h1>Paramètres</h1><p>Profil, accès, sauvegarde chiffrée et suppression des données.</p></div><span className="role-badge"><ShieldCheck size={15} /> {currentUser.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span></header>
    {error ? <Alert>{error}</Alert> : null}{message ? <Alert tone="success">{message}</Alert> : null}{generatedPassword ? <Alert tone="info">Mot de passe généré : <code>{generatedPassword}</code>. Copiez-le maintenant : il ne sera plus affiché.</Alert> : null}
    <section className="settings-grid">
      <article className="panel"><div className="panel-heading"><div><h2>Profil</h2><p>@{currentUser.username}</p></div></div><Form onSubmit={saveProfile}><Field label="Nom affiché"><input name="display_name" defaultValue={data.profile.display_name ?? ''} maxLength={100} /></Field><ConfirmButton busy={busy}>Enregistrer</ConfirmButton></Form></article>
      <article className="panel"><div className="panel-heading"><div><h2>Mot de passe</h2><p>12 caractères minimum.</p></div><KeyRound size={19} /></div><Form onSubmit={savePassword}><Field label="Mot de passe actuel"><input name="currentPassword" type="password" required /></Field><div className="form-grid"><Field label="Nouveau"><input name="newPassword" type="password" minLength={12} required /></Field><Field label="Confirmation"><input name="confirmation" type="password" minLength={12} required /></Field></div><ConfirmButton busy={busy}>Changer le mot de passe</ConfirmButton></Form></article>
      <article className="panel"><div className="panel-heading"><div><h2>Sauvegarde personnelle</h2><p>Toutes vos données dans un fichier AES-256-GCM.</p></div><Download size={19} /></div><Form onSubmit={backup}><Field label="Mot de passe du compte"><input name="password" type="password" required /></Field><div className="form-grid"><Field label="Phrase secrète du backup"><input name="passphrase" type="password" minLength={12} required /></Field><Field label="Confirmation"><input name="passphraseConfirmation" type="password" minLength={12} required /></Field></div><ConfirmButton busy={busy}>Télécharger le backup</ConfirmButton></Form></article>
      <article className="panel danger-panel"><div className="panel-heading"><div><h2>Supprimer mon compte</h2><p>Suppression irréversible du profil et de toutes les données financières.</p></div><Trash2 size={19} /></div><Form onSubmit={removeAccount}><Field label="Mot de passe"><input name="password" type="password" required /></Field><Field label="Tapez SUPPRIMER"><input name="confirmation" required pattern="SUPPRIMER" /></Field><ConfirmButton busy={busy} tone="danger">Supprimer définitivement</ConfirmButton></Form></article>
    </section>
    {currentUser.role === 'admin' ? <section className="panel admin-users"><div className="panel-heading"><div><h2>Utilisateurs de l’installation</h2><p>Cette création dans l’interface est la seule permission réservée à l’administrateur.</p></div><Users size={20} /></div><div className="admin-users-layout"><Form onSubmit={addUser}><div className="form-grid"><Field label="Nom d’utilisateur"><input name="username" minLength={3} maxLength={32} required /></Field><Field label="Nom affiché"><input name="displayName" maxLength={100} /></Field></div><Field label="Mot de passe" hint="Laissez vide pour en générer un sécurisé."><input name="password" type="password" minLength={12} /></Field><ConfirmButton busy={busy}><UserPlus size={16} /> Créer l’utilisateur</ConfirmButton></Form><div className="users-list">{users.map((user) => <div key={user.id}><span className="avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName || user.username}</strong><p>@{user.username} · {user.role}</p></div><small>{user.lastLoginAt ? `Vu ${formatDate(user.lastLoginAt)}` : 'Jamais connecté'}</small></div>)}</div></div></section> : null}
  </>
}
