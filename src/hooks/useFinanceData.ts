import { useCallback, useEffect, useState } from 'react'
import { loadFinanceData } from '../lib/finance-api'
import type { FinanceData } from '../types'

export function useFinanceData() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setData(await loadFinanceData())
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const source = new EventSource('/api/finance/events', { withCredentials: true })
    source.addEventListener('finance-changed', () => void refresh())
    source.onerror = () => {
      // EventSource reconnects automatically. The periodic refresh covers long outages.
    }
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => {
      source.close()
      window.clearInterval(timer)
    }
  }, [refresh])

  return { data, error, loading, refresh }
}
