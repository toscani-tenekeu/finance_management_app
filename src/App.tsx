import { useEffect, useMemo, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { Shell, type ViewName } from './components/Shell'
import { Alert, Spinner } from './components/Ui'
import { useFinanceData } from './hooks/useFinanceData'
import { getCurrentUser, logout } from './lib/finance-api'
import { calculateForecast } from './lib/forecast'
import { AccountsPage } from './pages/AccountsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ForecastPage } from './pages/ForecastPage'
import { RecurringPage } from './pages/RecurringPage'
import { SavingsPage } from './pages/SavingsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import type { AppUser } from './types'

function Workspace({ user, setUser }: { user: AppUser; setUser: (user: AppUser | null) => void }) {
  const [view, setView] = useState<ViewName>('dashboard')
  const [year, setYear] = useState(new Date().getFullYear())
  const { data, error, loading, refresh } = useFinanceData()

  async function signOut() {
    try { await logout() } finally { setUser(null) }
  }

  const forecast = useMemo(() => data ? calculateForecast(data, year) : null, [data, year])
  if (loading) return <Spinner label="Chargement des finances…" />
  if (!data || !forecast) return <main className="gate-page"><section className="gate-card"><Alert>{error ?? 'Données indisponibles.'}</Alert><button className="button button-secondary" onClick={() => void refresh()}>Réessayer</button><button className="text-button" onClick={() => void signOut()}>Se déconnecter</button></section></main>

  let page
  if (view === 'dashboard') page = <DashboardPage data={data} forecast={forecast} year={year} setView={setView} />
  else if (view === 'accounts') page = <AccountsPage data={data} refresh={refresh} />
  else if (view === 'transactions') page = <TransactionsPage data={data} year={year} refresh={refresh} />
  else if (view === 'recurring') page = <RecurringPage data={data} refresh={refresh} />
  else if (view === 'savings') page = <SavingsPage data={data} forecast={forecast} year={year} refresh={refresh} />
  else if (view === 'forecast') page = <ForecastPage forecast={forecast} year={year} />
  else page = <SettingsPage currentUser={user} data={data} refresh={refresh} onAccountDeleted={() => setUser(null)} />

  return <Shell view={view} setView={setView} year={year} setYear={setYear} username={user.username} onSignOut={() => void signOut()}>{error ? <Alert>{error}</Alert> : null}{page}</Shell>
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getCurrentUser()
      .then((result) => setUser(result.user))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Application indisponible.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label="Ouverture de l’installation…" />
  if (error) return <main className="gate-page"><section className="gate-card"><Alert>{error}</Alert></section></main>
  if (!user) return <AuthScreen onAuthenticated={setUser} />
  return <Workspace user={user} setUser={setUser} />
}
