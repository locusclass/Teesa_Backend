import Fastify from 'fastify'
import { env, isDev } from './config/env'
import { registerPlugins } from './plugins'
import { registerRoutes } from './routes'
import { setupRealtime } from './realtime/socketServer'
import { prisma } from './db/client'

const app = Fastify({
  logger: {
    level: isDev ? 'debug' : 'info',
    transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  },
  // Railway terminates TLS at the edge and forwards via proxy
  // Trust the X-Forwarded-* headers from Railway's proxy
  trustProxy: true,
})

async function start() {
  try {
    await registerPlugins(app)
    await registerRoutes(app)
    setupRealtime(app.server)

    // PORT is injected by Railway at runtime
    const port = env.PORT
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`🚀 Teesa API running on port ${port}`)

    if (isDev) {
      console.log(`📚 Swagger docs: http://localhost:${port}/docs`)
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
// Railway sends SIGTERM before killing the container; give in-flight requests
// time to complete before disconnecting the database.
async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully…`)
  try {
    await app.close()
    await prisma.$disconnect()
    console.log('Shutdown complete')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

start()

export { app }
