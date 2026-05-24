import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { driverService } from '../services/driver.service'
import { success, error } from '../utils/response'

export async function driverRoutes(app: FastifyInstance) {
  app.get('/profile', {
    preHandler: authenticate,
    schema: { tags: ['Drivers'], description: 'Get driver profile', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const profile = await driverService.getDriverProfile(user.sub)
    if (!profile) return reply.code(404).send(error('Driver profile not found'))
    return reply.send(success(profile))
  })

  app.post('/profile', {
    preHandler: authenticate,
    schema: { tags: ['Drivers'], description: 'Create/update driver profile', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const body = req.body as Record<string, unknown>
      const profile = await driverService.createOrUpdateProfile(user.sub, {
        nationalIdNo: body.nationalIdNo as string,
        licenseNo: body.licenseNo as string,
        licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry as string) : undefined,
        serviceAreas: body.serviceAreas as string[],
      })
      return reply.code(201).send(success(profile))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.patch('/online', {
    preHandler: authenticate,
    schema: { tags: ['Drivers'], description: 'Toggle online/offline status', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { isOnline, lat, lng } = req.body as { isOnline: boolean; lat?: number; lng?: number }
      const profile = await driverService.setOnlineStatus(user.sub, isOnline, lat, lng)
      return reply.send(success(profile))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.post('/location', {
    preHandler: authenticate,
    schema: { tags: ['Drivers'], description: 'Update driver location', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { lat, lng } = req.body as { lat: number; lng: number }
      await driverService.updateLocation(user.sub, lat, lng)
      return reply.send(success(null, 'Location updated'))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/nearby', {
    preHandler: authenticate,
    schema: { tags: ['Drivers'], description: 'Get nearby drivers', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { lat, lng, categoryId, radius } = req.query as {
      lat: string; lng: string; categoryId?: string; radius?: string
    }
    const drivers = await driverService.getNearbyDrivers(
      parseFloat(lat), parseFloat(lng), categoryId, radius ? parseFloat(radius) : 10
    )
    return reply.send(success(drivers))
  })
}
