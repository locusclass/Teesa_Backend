import { FastifyInstance } from 'fastify'
import { authRoutes } from './auth.routes'
import { userRoutes } from './user.routes'
import { driverRoutes } from './driver.routes'
import { vehicleRoutes } from './vehicle.routes'
import { bookingRoutes } from './booking.routes'
import { offerRoutes } from './offer.routes'
import { paymentRoutes } from './payment.routes'
import { walletRoutes } from './wallet.routes'
import { ratingRoutes } from './rating.routes'
import { disputeRoutes } from './dispute.routes'
import { notificationRoutes } from './notification.routes'
import { categoryRoutes } from './category.routes'
import { pricingRoutes } from './pricing.routes'
import { adminRoutes } from './admin.routes'
import { locationRoutes } from './location.routes'

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString(), service: 'teesa-api' }))
  app.get('/ready', async () => ({ status: 'ready', timestamp: new Date().toISOString() }))

  const v1 = { prefix: '/api/v1' }
  app.register(authRoutes, { prefix: '/api/v1/auth' })
  app.register(userRoutes, { prefix: '/api/v1/users' })
  app.register(driverRoutes, { prefix: '/api/v1/drivers' })
  app.register(vehicleRoutes, { prefix: '/api/v1/vehicles' })
  app.register(bookingRoutes, { prefix: '/api/v1/bookings' })
  app.register(offerRoutes, { prefix: '/api/v1/offers' })
  app.register(paymentRoutes, { prefix: '/api/v1/payments' })
  app.register(walletRoutes, { prefix: '/api/v1/wallets' })
  app.register(ratingRoutes, { prefix: '/api/v1/ratings' })
  app.register(disputeRoutes, { prefix: '/api/v1/disputes' })
  app.register(notificationRoutes, { prefix: '/api/v1/notifications' })
  app.register(categoryRoutes, { prefix: '/api/v1/categories' })
  app.register(pricingRoutes, { prefix: '/api/v1/pricing' })
  app.register(adminRoutes, { prefix: '/api/v1/admin' })
  app.register(locationRoutes, { prefix: '/api/v1/locations' })
}
