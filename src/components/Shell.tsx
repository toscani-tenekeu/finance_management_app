import {
  BarChart3,
  CalendarRange,
  Landmark,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  ReceiptText,
  Settings,
  WalletCards,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type ViewName = 'dashboard' | 'accounts' | 'transactions' | 'recurring' | 'savings' | 'forecast' | 'settings'

const navItems: Array<{ id: ViewName; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Vue générale', icon: LayoutDashboard },
  { id: 'accounts', label: 'Soldes', icon: WalletCards },
  { id: 'transactions', label: 'Mouvements', icon: ReceiptText },
  { id: 'recurring', label: 'Récurrents', icon: CalendarRange },
  { id: 'savings', label: 'Épargne', icon: PiggyBank },
  { id: 'forecast', label: 'Prévisions', icon: BarChart3 },
  { id: 'settings', label: 'Paramètres', icon: Settings },
]

export function Shell({
  view,
  setView,
  year,
  setYear,
  username,
  children,
  onSignOut,
}: {
  view: ViewName
  setView: (view: ViewName) => void
  year: number
  setYear: (year: number) => void
  username: string
  children: ReactNode
  onSignOut: () => void
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 7 }, (_, index) => currentYear + 1 - index)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span><Landmark size={19} /></span><strong>Finance</strong></div>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
                <Icon size={18} /> {item.label}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-user">
          <span>@{username}</span>
          <button type="button" onClick={onSignOut}><LogOut size={15} /> Se déconnecter</button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><Landmark size={18} /> Finance</div>
          <div className="year-control">
            <label htmlFor="year">Année analysée</label>
            <select id="year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {years.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Navigation mobile">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><Icon size={16} />{item.label}</button>
          })}
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
