import Fastify from 'fastify'
import { env, isDev } from './config/env'
import { registerPlugins } from './plugins'
import { registerRoutes } from './routes'
import { setupRealtime } from './realtime/socketServer'

const app = Fastify({
  logger: {
    level: isDev ? 'debug' : 'info',
    transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  },
})

async function start() {
  try {
    await registerPlugins(app)
    await registerRoutes(app)
    setupRealtime(app.server)

    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`🚀 Teesa API running on port ${env.PORT}`)
    console.log(`📚 Swagger docs: http://localhost:${env.PORT}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()

export { app }
