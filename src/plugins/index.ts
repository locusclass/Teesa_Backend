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

export async function registerPlugins(app: FastifyInstance) {
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map(o => o.trim()),
    credentials: true,
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    skipOnError: true,
  })

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  })

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Users', description: 'User management' },
        { name: 'Drivers', description: 'Driver onboarding and management' },
        { name: 'Vehicles', description: 'Vehicle management' },
        { name: 'Bookings', description: 'Booking operations' },
        { name: 'Offers', description: 'Negotiation offers' },
        { name: 'Payments', description: 'Payment operations' },
        { name: 'Wallets', description: 'Wallet management' },
        { name: 'Categories', description: 'Transport categories' },
        { name: 'Pricing', description: 'Pricing rules' },
        { name: 'Admin', description: 'Admin operations' },
        { name: 'Ratings', description: 'Ratings and reviews' },
        { name: 'Disputes', description: 'Dispute management' },
        { name: 'Notifications', description: 'Push notifications' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })
}
