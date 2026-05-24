import { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import fastifyWebsocket from '@fastify/websocket'
import { env } from '../config/env'

function buildCorsOrigin(raw: string) {
  // '*' → allow everything (useful for early dev / when Railway generates URLs)
  if (raw.trim() === '*') return true

  const allowed = raw.split(',').map(o => o.trim()).filter(Boolean)

  // Return a function so we can do runtime matching (supports *.railway.app wildcards)
  return (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
    if (!origin) return cb(null, true) // non-browser requests (mobile apps, Postman)
    const ok = allowed.some(o => {
      if (o === origin) return true
      if (o.startsWith('*.')) {
        const suffix = o.slice(1) // e.g. '.railway.app'
        return origin.endsWith(suffix)
      }
      return false
    })
    cb(ok ? null : new Error('Not allowed by CORS'), ok)
  }
}

export async function registerPlugins(app: FastifyInstance) {
  await app.register(cors, {
    origin: buildCorsOrigin(env.CORS_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
    // Railway terminates TLS before the app, so HSTS is handled upstream
    hsts: false,
  })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    skipOnError: true,
    // Trust Railway's proxy headers for accurate IP rate limiting
    keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip,
  })

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  })

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  })

  await app.register(fastifyWebsocket)

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Teesa Transport Platform API',
        description: 'Universal transport and ride-hailing platform for Uganda',
        version: '1.0.0',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          Bearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ Bearer: [] }],
      tags: [
        { name: 'Auth',          description: 'Authentication endpoints' },
        { name: 'Users',         description: 'User management' },
        { name: 'Drivers',       description: 'Driver onboarding and management' },
        { name: 'Vehicles',      description: 'Vehicle management' },
        { name: 'Bookings',      description: 'Booking operations' },
        { name: 'Offers',        description: 'Negotiation offers' },
        { name: 'Payments',      description: 'Payment operations' },
        { name: 'Wallets',       description: 'Wallet management' },
        { name: 'Categories',    description: 'Transport categories' },
        { name: 'Pricing',       description: 'Pricing rules' },
        { name: 'Admin',         description: 'Admin operations' },
        { name: 'Ratings',       description: 'Ratings and reviews' },
        { name: 'Disputes',      description: 'Dispute management' },
        { name: 'Notifications', description: 'Push notifications' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })
}
