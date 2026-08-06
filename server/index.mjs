import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanExpiredSessions } from './auth.mjs'
import { createApp } from './app.mjs'
import { closeDatabase, openDatabase } from './database.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = path.resolve(process.env.DATABASE_PATH ?? path.join(root, 'data', 'finance.db'))
const distPath = path.join(root, 'dist')
const port = Number.parseInt(process.env.PORT ?? '7410', 10)
const host = process.env.HOST ?? '0.0.0.0'
const db = openDatabase(databasePath)
cleanExpiredSessions(db)

const app = createApp({ db, distPath })
const server = app.listen(port, host, () => {
  console.log(`Finance Management App listening on http://${host}:${port}`)
})

const cleanupTimer = setInterval(() => cleanExpiredSessions(db), 60 * 60 * 1000)
cleanupTimer.unref()

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`)
  clearInterval(cleanupTimer)
  app.locals.closeEventHub()
  server.close(() => {
    closeDatabase(db)
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
