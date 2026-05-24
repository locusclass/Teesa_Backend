import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload, requireAdmin } from '../middleware/auth'
import { prisma } from '../db/client'
import { success, error } from '../utils/response'

export async function paymentRoutes(app: FastifyInstance) {
  app.post('/booking/:bookingId', {
    preHandler: authenticate,
    schema: { tags: ['Payments'], description: 'Record payment for booking', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { bookingId } = req.params as { bookingId: string }
      const { method } = req.body as { method: 'CASH' | 'WALLET' | 'MOBILE_MONEY' }

      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) return reply.code(404).send(error('Booking not found'))
      if (booking.passengerId !== user.sub) return reply.code(403).send(error('Not your booking'))
      if (!booking.finalFare) return reply.code(400).send(error('Fare not set'))

      const existingPayment = await prisma.payment.findUnique({ where: { bookingId } })
      if (existingPayment) return reply.code(409).send(error('Payment already recorded'))

      if (method === 'WALLET') {
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.sub } })
        if (!wallet || wallet.balance < booking.finalFare) {
          return reply.code(400).send(error('Insufficient wallet balance'))
        }
        const newBalance = wallet.balance - booking.finalFare
        await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } })
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEBIT',
            amount: booking.finalFare,
            balance: newBalance,
            description: `Payment for booking #${bookingId.slice(-8)}`,
            bookingId,
          },
        })
      }

      const payment = await prisma.payment.create({
        data: {
          bookingId,
          passengerId: user.sub,
          driverId: booking.driverId,
          amount: booking.finalFare,
          platformFee: booking.platformFee || 0,
          driverPayout: booking.driverEarnings || 0,
          method,
          status: method === 'CASH' ? 'COMPLETED' : 'PROCESSING',
          paidAt: method === 'CASH' ? new Date() : undefined,
        },
      })

      return reply.code(201).send(success(payment))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/booking/:bookingId', {
    preHandler: authenticate,
    schema: { tags: ['Payments'], description: 'Get payment for booking', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string }
    const payment = await prisma.payment.findUnique({ where: { bookingId } })
    if (!payment) return reply.code(404).send(error('Payment not found'))
    return reply.send(success(payment))
  })
}
