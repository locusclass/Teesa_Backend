import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { prisma } from '../db/client'
import { success, error } from '../utils/response'

export async function ratingRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: authenticate,
    schema: { tags: ['Ratings'], description: 'Submit a rating', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { bookingId, ratedId, score, comment } = req.body as {
        bookingId: string; ratedId: string; score: number; comment?: string
      }
      if (score < 1 || score > 5) return reply.code(400).send(error('Score must be between 1 and 5'))

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) return reply.code(404).send(error('Booking not found'))
      if (booking.status !== 'COMPLETED') return reply.code(400).send(error('Booking not completed'))

      const rating = await prisma.rating.create({
        data: { bookingId, raterId: user.sub, ratedId, score, comment },
      })

      const avg = await prisma.rating.aggregate({
        where: { ratedId },
        _avg: { score: true },
        _count: { score: true },
      })

      await prisma.user.update({
        where: { id: ratedId },
        data: {
          rating: avg._avg.score || 0,
          ratingCount: avg._count.score,
        },
      })

      return reply.code(201).send(success(rating))
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg.includes('Unique constraint')) return reply.code(409).send(error('Already rated'))
      return reply.code(400).send(error(msg))
    }
  })

  app.get('/user/:userId', {
    schema: { tags: ['Ratings'], description: 'Get ratings for a user' },
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string }
    const ratings = await prisma.rating.findMany({
      where: { ratedId: userId },
      include: { rater: { select: { id: true, fullName: true, profilePhoto: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return reply.send(success(ratings))
  })
}
