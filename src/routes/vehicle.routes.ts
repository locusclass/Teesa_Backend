import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { prisma } from '../db/client'
import { success, error } from '../utils/response'

export async function vehicleRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: authenticate,
    schema: { tags: ['Vehicles'], description: 'Register a vehicle', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const dp = await prisma.driverProfile.findUnique({ where: { userId: user.sub } })
      if (!dp) return reply.code(404).send(error('Driver profile required first'))
      const body = req.body as Record<string, unknown>
      const vehicle = await prisma.vehicle.create({
        data: {
          ownerId: dp.id,
          driverId: dp.id,
          categoryId: body.categoryId as string,
          make: body.make as string,
          model: body.model as string,
          year: body.year as number,
          plateNumber: body.plateNumber as string,
          color: body.color as string,
          seats: body.seats as number,
          cargoCapacity: body.cargoCapacity as number,
          truckType: body.truckType as string,
          bodyType: body.bodyType as string,
        },
      })
      return reply.code(201).send(success(vehicle))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/mine', {
    preHandler: authenticate,
    schema: { tags: ['Vehicles'], description: 'Get my vehicles', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const dp = await prisma.driverProfile.findUnique({ where: { userId: user.sub } })
    if (!dp) return reply.code(404).send(error('Driver profile not found'))
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: dp.id },
      include: { category: true, documents: true },
    })
    return reply.send(success(vehicles))
  })

  app.get('/:id', {
    preHandler: authenticate,
    schema: { tags: ['Vehicles'], description: 'Get vehicle details', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { category: true, owner: { include: { user: { select: { id: true, fullName: true, phone: true } } } } },
    })
    if (!vehicle) return reply.code(404).send(error('Vehicle not found'))
    return reply.send(success(vehicle))
  })

  app.patch('/:id', {
    preHandler: authenticate,
    schema: { tags: ['Vehicles'], description: 'Update vehicle', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const dp = await prisma.driverProfile.findUnique({ where: { userId: user.sub } })
      if (!dp) return reply.code(403).send(error('Not authorized'))
      const vehicle = await prisma.vehicle.findFirst({ where: { id, ownerId: dp.id } })
      if (!vehicle) return reply.code(404).send(error('Vehicle not found'))
      const body = req.body as Record<string, unknown>
      const updated = await prisma.vehicle.update({
        where: { id },
        data: { color: body.color as string, seats: body.seats as number, isActive: body.isActive as boolean },
      })
      return reply.send(success(updated))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
