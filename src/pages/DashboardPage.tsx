import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { ArrowDownRight, ArrowUpRight, CircleGauge, PiggyBank, ShieldAlert, Wallet } from 'lucide-react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { formatMoney, monthLabels } from '../lib/format'
import type { ForecastResult } from '../lib/forecast'
import type { FinanceData } from '../types'
import type { ViewName } from '../components/Shell'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler)

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail: string
  icon: typeof Wallet
  tone?: 'neutral' | 'green' | 'amber'
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

export function DashboardPage({
  data,
  forecast,
  year,
  setView,
}: {
  data: FinanceData
  forecast: ForecastResult
  year: number
  setView: (view: ViewName) => void
}) {
  const riskCopy = {
    healthy: { label: 'Situation solide', detail: 'La réserve et les flux prévus couvrent les engagements actuels.' },
    watch: { label: 'Vigilance utile', detail: 'La marge existe, mais reste sous la réserve ou la régularité visée.' },
    critical: { label: 'Risque élevé', detail: 'Le scénario actuel prévoit une tension de trésorerie ou une épargne insuffisante.' },
  }[forecast.riskLevel]
  const yearTransactions = data.transactions.filter((transaction) => new Date(transaction.occurred_at).getFullYear() === year)
  const totalIncome = yearTransactions
    .filter((transaction) => transaction.transaction_type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const totalExpenses = yearTransactions
    .filter((transaction) => transaction.transaction_type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)

  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">Position financière · {year}</p><h1>Vue générale</h1><p>Soldes réels, engagements et scénario de fin d’année au même endroit.</p></div>
        <button className="button button-primary" onClick={() => setView('transactions')}>Déclarer un mouvement</button>
      </header>

      <section className="stat-grid">
        <StatCard label="Disponible" value={formatMoney(forecast.usableBalance)} detail="Argent utilisable maintenant" icon={Wallet} />
        <StatCard label="Épargne" value={formatMoney(forecast.savingsBalance)} detail="Sur les comptes marqués épargne" icon={PiggyBank} tone="green" />
        <StatCard label="Revenus déclarés" value={formatMoney(totalIncome)} detail={`Cumul ${year}`} icon={ArrowUpRight} />
        <StatCard label="Dépenses déclarées" value={formatMoney(totalExpenses)} detail={`Cumul ${year}`} icon={ArrowDownRight} tone="amber" />
      </section>

      <section className={`risk-banner risk-${forecast.riskLevel}`}>
        <div className="risk-score"><CircleGauge size={24} /><strong>{forecast.savingsProbability}%</strong></div>
        <div><span>{riskCopy.label}</span><p>{riskCopy.detail}</p></div>
        <button className="button button-ghost" onClick={() => setView('forecast')}>Voir le calcul</button>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading"><div><h2>Flux mensuels</h2><p>Réalisé et projection pondérée</p></div><span className="live-pill">Calcul en direct</span></div>
          <div className="chart-wrap">
            <Bar
              data={{
                labels: [...monthLabels],
                datasets: [
                  { label: 'Revenus', data: forecast.months.map((month) => month.projectedIncome), backgroundColor: '#2f7d65', borderRadius: 5 },
                  { label: 'Dépenses', data: forecast.months.map((month) => month.projectedExpenses), backgroundColor: '#e0a569', borderRadius: 5 },
                  { label: 'Épargne', data: forecast.months.map((month) => month.projectedSavings), backgroundColor: '#93c5b4', borderRadius: 5 },
                ],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }}
            />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Dépenses</h2><p>Répartition par catégorie</p></div></div>
          {forecast.expenseByCategory.length ? (
            <div className="chart-wrap chart-donut">
              <Doughnut
                data={{
                  labels: forecast.expenseByCategory.map((item) => item.category),
                  datasets: [{ data: forecast.expenseByCategory.map((item) => item.amount), backgroundColor: ['#2f7d65', '#e0a569', '#92a6b0', '#c77b70', '#7d9d83', '#d4bf87'] }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
              />
            </div>
          ) : <div className="mini-empty"><ShieldAlert size={24} /><p>Ajoutez des dépenses pour afficher leur répartition.</p></div>}
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading"><div><h2>Trésorerie disponible</h2><p>Scénario jusqu’à décembre</p></div><strong>{formatMoney(forecast.projectedYearEndAvailable)}</strong></div>
          <div className="chart-wrap chart-short">
            <Line
              data={{ labels: [...monthLabels], datasets: [{ label: 'Disponible projeté', data: forecast.months.map((month) => month.projectedAvailable), borderColor: '#173d32', backgroundColor: 'rgba(47,125,101,.12)', fill: true, tension: 0.35, pointRadius: 2 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }}
            />
          </div>
        </article>
      </section>
    </>
  )
}
