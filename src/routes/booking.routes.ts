import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { bookingService } from '../services/booking.service'
import { success, error, paginated, parsePagination } from '../utils/response'
import { BookingType } from '@prisma/client'

export async function bookingRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'Create a new booking', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const body = req.body as Record<string, unknown>
      const booking = await bookingService.createBooking({
        passengerId: user.sub,
        categoryId: body.categoryId as string,
        bookingType: (body.bookingType as BookingType) || BookingType.INSTANT,
        pickupLat: body.pickupLat as number,
        pickupLng: body.pickupLng as number,
        pickupAddress: body.pickupAddress as string,
        destLat: body.destLat as number,
        destLng: body.destLng as number,
        destAddress: body.destAddress as string,
        proposedBudget: body.proposedBudget as number,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt as string) : undefined,
        cargoDetails: body.cargoDetails as Record<string, unknown>,
        passengerCount: body.passengerCount as number,
        notes: body.notes as string,
        photos: body.photos as string[],
        negotiationDeadline: body.negotiationDeadline ? new Date(body.negotiationDeadline as string) : undefined,
        isUrgent: body.isUrgent as boolean,
        requiresHelper: body.requiresHelper as boolean,
      })
      return reply.code(201).send(success(booking, 'Booking created'))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'List bookings for current user', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const { data, total } = await bookingService.listPassengerBookings(user.sub, page, limit)
    return reply.send(paginated(data, total, page, limit))
  })

  app.get('/driver', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'List bookings for driver', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { prisma } = await import('../db/client')
      const dp = await prisma.driverProfile.findUnique({ where: { userId: user.sub } })
      if (!dp) return reply.code(404).send(error('Driver profile not found'))
      const query = req.query as Record<string, string>
      const { page, limit } = parsePagination(query)
      const { data, total } = await bookingService.listDriverBookings(dp.id, page, limit)
      return reply.send(paginated(data, total, page, limit))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/:id', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'Get booking details', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const booking = await bookingService.getBookingById(id)
    if (!booking) return reply.code(404).send(error('Booking not found'))
    return reply.send(success(booking))
  })

  app.patch('/:id/status', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'Update booking status', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { status, note } = req.body as { status: string; note?: string }
      const { BookingStatus } = await import('@prisma/client')
      const updated = await bookingService.updateStatus(id, status as import('@prisma/client').BookingStatus, user.sub, note)
      return reply.send(success(updated))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.patch('/:id/accept-driver', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'Accept a driver for instant booking', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { driverProfileId, offerId } = req.body as { driverProfileId: string; offerId?: string }
      const updated = await bookingService.acceptDriver(id, driverProfileId, offerId)
      return reply.send(success(updated))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.delete('/:id/cancel', {
    preHandler: authenticate,
    schema: { tags: ['Bookings'], description: 'Cancel a booking', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { reason } = req.body as { reason: string }
      const updated = await bookingService.cancelBooking(id, user.sub, reason)
      return reply.send(success(updated))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
