export const formatMoney = (amount: number): string =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))

export const monthLabels = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
] as const

export const toDateInput = (date = new Date()): string => {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}
