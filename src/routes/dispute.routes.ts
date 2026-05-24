import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload, requireAdmin } from '../middleware/auth'
import { prisma } from '../db/client'
import { success, error } from '../utils/response'
import { audit } from '../utils/audit'

export async function disputeRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: authenticate,
    schema: { tags: ['Disputes'], description: 'Open a dispute', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { bookingId, reason, description, evidence } = req.body as {
        bookingId: string; reason: string; description: string; evidence?: string[]
      }
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) return reply.code(404).send(error('Booking not found'))
      const existing = await prisma.dispute.findUnique({ where: { bookingId } })
      if (existing) return reply.code(409).send(error('Dispute already opened for this booking'))

      const dispute = await prisma.dispute.create({
        data: { bookingId, openedById: user.sub, reason, description, evidence: evidence || [] },
      })
      await prisma.booking.update({ where: { id: bookingId }, data: { status: 'DISPUTED' } })
      return reply.code(201).send(success(dispute))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/mine', {
    preHandler: authenticate,
    schema: { tags: ['Disputes'], description: 'Get my disputes', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const disputes = await prisma.dispute.findMany({
      where: { openedById: user.sub },
      include: { booking: { select: { id: true, status: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(success(disputes))
  })

  app.patch('/:id/resolve', {
    preHandler: requireAdmin(),
    schema: { tags: ['Disputes'], description: 'Resolve a dispute (admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { resolution } = req.body as { resolution: string }
      const dispute = await prisma.dispute.update({
        where: { id },
        data: { status: 'RESOLVED', resolution, resolvedAt: new Date(), assignedTo: user.sub },
      })
      await audit({ actorId: user.sub, action: 'resolve_dispute', entity: 'Dispute', entityId: id, metadata: { resolution } })
      return reply.send(success(dispute))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
