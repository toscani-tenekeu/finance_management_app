import { Landmark, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { login } from '../lib/finance-api'
import type { AppUser } from '../types'
import { Alert } from './Ui'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await login(username, password)
      onAuthenticated(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentification impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand-mark"><Landmark size={24} /></div>
        <p className="eyebrow">Finance Management</p>
        <h1>Votre argent, clairement.</h1>
        <p>Suivez ce qui est disponible, ce qui est épargné et ce que les prochains mois peuvent réellement permettre.</p>
        <div className="privacy-note"><ShieldCheck size={18} /> Données locales SQLite, isolées par utilisateur.</div>
      </section>
      <section className="auth-card">
        <p className="eyebrow">Installation privée</p>
        <h2>Connexion</h2>
        <p className="muted">Utilisez le compte créé pendant l’installation ou par votre administrateur.</p>
        {error ? <Alert>{error}</Alert> : null}
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Nom d’utilisateur</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={32} autoComplete="username" autoFocus />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          <button className="button button-primary button-block" disabled={busy}>{busy ? 'Vérification…' : 'Se connecter'}</button>
        </form>
      </section>
    </main>
  )
}
