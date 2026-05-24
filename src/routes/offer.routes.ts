import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { offerService } from '../services/offer.service'
import { success, error } from '../utils/response'

export async function offerRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: authenticate,
    schema: { tags: ['Offers'], description: 'Submit a driver offer', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { bookingId, offeredFare, message } = req.body as { bookingId: string; offeredFare: number; message?: string }
      const { prisma } = await import('../db/client')
      const dp = await prisma.driverProfile.findUnique({ where: { userId: user.sub } })
      if (!dp) return reply.code(404).send(error('Driver profile not found'))
      const offer = await offerService.submitOffer(bookingId, dp.id, offeredFare, message)
      return reply.code(201).send(success(offer))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/booking/:bookingId', {
    preHandler: authenticate,
    schema: { tags: ['Offers'], description: 'Get offers for a booking', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string }
    const offers = await offerService.getBookingOffers(bookingId)
    return reply.send(success(offers))
  })

  app.post('/:id/accept', {
    preHandler: authenticate,
    schema: { tags: ['Offers'], description: 'Accept an offer', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const offer = await offerService.acceptOffer(id, user.sub)
      return reply.send(success(offer))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.post('/:id/counter', {
    preHandler: authenticate,
    schema: { tags: ['Offers'], description: 'Submit a counter-offer', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { counterFare, message } = req.body as { counterFare: number; message?: string }
      const counter = await offerService.submitCounterOffer(id, user.sub, counterFare, message)
      return reply.code(201).send(success(counter))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.delete('/:id/withdraw', {
    preHandler: authenticate,
    schema: { tags: ['Offers'], description: 'Withdraw an offer', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { prisma } = await import('../db/client')
      const dp = await prisma.driverProfile.findUnique({ where: { userId: user.sub } })
      if (!dp) return reply.code(404).send(error('Driver profile not found'))
      const offer = await offerService.withdrawOffer(id, dp.id)
      return reply.send(success(offer))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
