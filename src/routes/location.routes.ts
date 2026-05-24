import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { driverService } from '../services/driver.service'
import { getDistanceAndDuration } from '../integrations/maps'
import { success, error } from '../utils/response'

export async function locationRoutes(app: FastifyInstance) {
  app.get('/drivers/nearby', {
    preHandler: authenticate,
    schema: { tags: ['Locations'], description: 'Get nearby drivers', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { lat, lng, categoryId, radius } = req.query as {
      lat: string; lng: string; categoryId?: string; radius?: string
    }
    const drivers = await driverService.getNearbyDrivers(
      parseFloat(lat), parseFloat(lng), categoryId, radius ? parseFloat(radius) : 10
    )
    return reply.send(success(drivers))
  })

  app.post('/estimate', {
    schema: { tags: ['Locations'], description: 'Estimate distance and duration between two points' },
  }, async (req, reply) => {
    try {
      const { originLat, originLng, destLat, destLng } = req.body as {
        originLat: number; originLng: number; destLat: number; destLng: number
      }
      const result = await getDistanceAndDuration(originLat, originLng, destLat, destLng)
      return reply.send(success(result))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
