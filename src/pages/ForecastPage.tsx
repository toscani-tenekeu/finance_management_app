import { Chart as ChartJS, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Activity, Gauge, Shield, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { formatMoney, monthLabels } from '../lib/format'
import type { ForecastResult } from '../lib/forecast'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler)

export function ForecastPage({ forecast, year }: { forecast: ForecastResult; year: number }) {
  const [incomeFactor, setIncomeFactor] = useState(100)
  const [riskFactor, setRiskFactor] = useState(100)
  const currentYear = new Date().getFullYear()
  const remainingMonths = year === currentYear ? Math.max(0, 11 - new Date().getMonth()) : year > currentYear ? 12 : 0
  const scenario = useMemo(() => {
    const incomeDelta = forecast.monthlyExpectedIncome * (incomeFactor / 100 - 1) * remainingMonths
    const riskDelta = forecast.monthlyExpectedUnplanned * (riskFactor / 100 - 1) * remainingMonths
    return forecast.projectedYearEndAvailable + incomeDelta - riskDelta
  }, [forecast, incomeFactor, remainingMonths, riskFactor])
  const scenarioLabel = scenario < 0 ? 'Déficit probable' : scenario < forecast.monthlyFixedCommitment ? 'Marge fragile' : 'Marge positive'

  return <>
    <header className="page-heading"><div><p className="eyebrow">Scénario probabiliste · {year}</p><h1>Prévisions financières</h1><p>Projection recalculée à partir des données réelles, revenus attendus, charges fixes, épargne et imprévus.</p></div><span className={`status-badge status-${forecast.riskLevel}`}>{forecast.riskLevel === 'healthy' ? 'Solide' : forecast.riskLevel === 'watch' ? 'À surveiller' : 'Critique'}</span></header>
    <section className="stat-grid forecast-stats"><article className="stat-card"><div className="stat-icon"><Gauge size={19} /></div><span>Probabilité d’atteindre le minimum</span><strong>{forecast.savingsProbability}%</strong><small>Estimation, pas une garantie</small></article><article className="stat-card stat-green"><div className="stat-icon"><Shield size={19} /></div><span>Autonomie disponible</span><strong>{forecast.runwayMonths >= 99 ? 'Sans limite' : `${forecast.runwayMonths.toFixed(1)} mois`}</strong><small>Charges + épargne + risques</small></article><article className="stat-card"><div className="stat-icon"><TrendingUp size={19} /></div><span>Disponible fin d’année</span><strong>{formatMoney(forecast.projectedYearEndAvailable)}</strong><small>Scénario central</small></article><article className="stat-card stat-amber"><div className="stat-icon"><Activity size={19} /></div><span>Imprévus mensuels pondérés</span><strong>{formatMoney(forecast.monthlyExpectedUnplanned)}</strong><small>Montant × probabilité</small></article></section>
    <section className="forecast-layout">
      <article className="panel panel-wide"><div className="panel-heading"><div><h2>Projection centrale</h2><p>Disponible et épargne jusqu’à décembre</p></div></div><div className="chart-wrap"><Line data={{ labels: [...monthLabels], datasets: [{ label: 'Disponible', data: forecast.months.map((month) => month.projectedAvailable), borderColor: '#173d32', backgroundColor: 'rgba(23,61,50,.10)', fill: true, tension: .35 }, { label: 'Épargne', data: forecast.months.map((month) => month.projectedSavingsBalance), borderColor: '#65a98e', backgroundColor: 'transparent', tension: .35 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } } } }} /></div></article>
      <article className="panel scenario-panel"><div className="panel-heading"><div><h2>Tester un scénario</h2><p>Modifiez deux hypothèses sans changer vos données.</p></div></div><label className="range-field"><span>Revenus attendus <strong>{incomeFactor}%</strong></span><input type="range" min="50" max="120" step="5" value={incomeFactor} onChange={(event) => setIncomeFactor(Number(event.target.value))} /></label><label className="range-field"><span>Coût des imprévus <strong>{riskFactor}%</strong></span><input type="range" min="50" max="200" step="10" value={riskFactor} onChange={(event) => setRiskFactor(Number(event.target.value))} /></label><div className={scenario < 0 ? 'scenario-result negative' : 'scenario-result'}><span>{scenarioLabel}</span><strong>{formatMoney(scenario)}</strong><small>Disponible estimé en décembre</small></div></article>
    </section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Détail mensuel</h2><p>Les mois futurs utilisent les montants pondérés.</p></div></div><div className="table-scroll"><table><thead><tr><th>Mois</th><th className="number">Revenus</th><th className="number">Dépenses</th><th className="number">Épargne</th><th className="number">Disponible projeté</th></tr></thead><tbody>{forecast.months.map((month) => <tr key={month.month}><td>{monthLabels[month.month]}</td><td className="number amount-positive">{formatMoney(month.projectedIncome)}</td><td className="number amount-negative">{formatMoney(month.projectedExpenses)}</td><td className="number">{formatMoney(month.projectedSavings)}</td><td className="number"><strong>{formatMoney(month.projectedAvailable)}</strong></td></tr>)}</tbody></table></div></section>
    <p className="calculation-note">La probabilité combine la régularité d’épargne (40 %), la couverture des obligations (30 %), la marge revenus/charges (20 %) et la quantité de données disponibles (10 %). Elle aide à décider, mais ne prédit pas un événement certain.</p>
  </>
}
