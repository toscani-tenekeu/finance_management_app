export function createEventHub() {
  const clients = new Map()

  function subscribe(userId, response) {
    const userClients = clients.get(userId) ?? new Set()
    userClients.add(response)
    clients.set(userId, userClients)
    response.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`)
    return () => {
      userClients.delete(response)
      if (userClients.size === 0) clients.delete(userId)
    }
  }

  function publish(userId, event = 'finance-changed') {
    const payload = `event: ${event}\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`
    for (const response of clients.get(userId) ?? []) response.write(payload)
  }

  function heartbeat() {
    for (const userClients of clients.values()) {
      for (const response of userClients) response.write(': keep-alive\n\n')
    }
  }

  const timer = setInterval(heartbeat, 25_000)
  timer.unref()
  return { subscribe, publish, close: () => clearInterval(timer) }
}
