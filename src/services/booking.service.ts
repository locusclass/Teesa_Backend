import { prisma } from '../db/client'
import { BookingType, BookingStatus, Prisma } from '@prisma/client'
import { getDistanceAndDuration } from '../integrations/maps'
import { emitToUser, emitToDrivers } from '../realtime/socketServer'
import { notificationService } from './notification.service'

export interface CreateBookingInput {
  passengerId: string
  categoryId: string
  bookingType: BookingType
  pickupLat?: number
  pickupLng?: number
  pickupAddress?: string
  destLat?: number
  destLng?: number
  destAddress?: string
  proposedBudget?: number
  scheduledAt?: Date
  cargoDetails?: Record<string, unknown>
  passengerCount?: number
  notes?: string
  photos?: string[]
  negotiationDeadline?: Date
  isUrgent?: boolean
  requiresHelper?: boolean
}

export class BookingService {
  async createBooking(input: CreateBookingInput) {
    const category = await prisma.transportCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new Error('Category not found')

    let distanceKm: number | undefined
    let estimatedMinutes: number | undefined
    let estimatedFare: number | undefined

    if (input.pickupLat && input.pickupLng && input.destLat && input.destLng) {
      const dist = await getDistanceAndDuration(
        input.pickupLat, input.pickupLng, input.destLat, input.destLng
      )
      distanceKm = dist.distanceKm
      estimatedMinutes = dist.durationMinutes

      const pricing = await prisma.pricingRule.findFirst({
        where: { categoryId: input.categoryId, isActive: true },
      })
      if (pricing) {
        const rawFare = pricing.baseFare + distanceKm * pricing.perKmRate + estimatedMinutes * pricing.perMinuteRate
        estimatedFare = Math.max(rawFare, pricing.minimumFare)
        if (pricing.vipMultiplier) estimatedFare *= pricing.vipMultiplier
        estimatedFare = Math.round(estimatedFare)
      }
    }

    const booking = await prisma.booking.create({
      data: {
        passengerId: input.passengerId,
        categoryId: input.categoryId,
        bookingType: input.bookingType,
        status: input.bookingType === BookingType.NEGOTIATED ? BookingStatus.PENDING : BookingStatus.SEARCHING,
        pickupLat: input.pickupLat,
        pickupLng: input.pickupLng,
        pickupAddress: input.pickupAddress,
        destLat: input.destLat,
        destLng: input.destLng,
        destAddress: input.destAddress,
        distanceKm,
        estimatedMinutes,
        estimatedFare,
        proposedBudget: input.proposedBudget,
        scheduledAt: input.scheduledAt,
        cargoDetails: input.cargoDetails as Prisma.InputJsonValue | undefined,
        passengerCount: input.passengerCount,
        notes: input.notes,
        photos: input.photos || [],
        negotiationDeadline: input.negotiationDeadline,
        isUrgent: input.isUrgent,
        requiresHelper: input.requiresHelper,
      },
    })

    await prisma.bookingStatusHistory.create({
      data: { bookingId: booking.id, status: booking.status, actorId: input.passengerId },
    })

    if (input.bookingType === BookingType.INSTANT) {
      emitToDrivers('new_instant_request', {
        bookingId: booking.id,
        categoryId: input.categoryId,
        categoryName: category.name,
        pickupAddress: input.pickupAddress,
        destAddress: input.destAddress,
        estimatedFare,
        isUrgent: input.isUrgent,
      })
    } else if (input.bookingType === BookingType.NEGOTIATED) {
      emitToDrivers('new_negotiated_request', {
        bookingId: booking.id,
        categoryId: input.categoryId,
        categoryName: category.name,
        pickupAddress: input.pickupAddress,
        destAddress: input.destAddress,
        proposedBudget: input.proposedBudget,
        deadline: input.negotiationDeadline,
      })
    }

    return booking
  }

  async acceptDriver(bookingId: string, driverProfileId: string, offerId?: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new Error('Booking not found')

    const driverProfile = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: { user: true },
    })
    if (!driverProfile) throw new Error('Driver not found')

    let finalFare = booking.estimatedFare
    if (offerId) {
      const offer = await prisma.bookingOffer.findUnique({ where: { id: offerId } })
      if (offer) {
        finalFare = offer.offeredFare
        await prisma.bookingOffer.update({
          where: { id: offerId },
          data: { status: 'ACCEPTED' },
        })
        await prisma.bookingOffer.updateMany({
          where: { bookingId, id: { not: offerId } },
          data: { status: 'REJECTED' },
        })
      }
    }

    const pricing = await prisma.pricingRule.findFirst({
      where: { categoryId: booking.categoryId, isActive: true },
    })
    const commission = pricing?.platformCommission || 0.15
    const platformFee = Math.round((finalFare || 0) * commission)
    const driverEarnings = Math.round((finalFare || 0) - platformFee)

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        driverId: driverProfileId,
        status: BookingStatus.DRIVER_ASSIGNED,
        acceptedAt: new Date(),
        finalFare,
        platformFee,
        driverEarnings,
      },
    })

    await prisma.bookingStatusHistory.create({
      data: { bookingId, status: BookingStatus.DRIVER_ASSIGNED, actorId: booking.passengerId },
    })

    emitToUser(booking.passengerId, 'booking_accepted', {
      bookingId,
      driver: {
        id: driverProfile.user.id,
        name: driverProfile.user.fullName,
        phone: driverProfile.user.phone,
        rating: driverProfile.user.rating,
      },
    })

    await notificationService.createNotification({
      userId: booking.passengerId,
      type: 'BOOKING_ACCEPTED',
      title: 'Driver Assigned',
      body: `${driverProfile.user.fullName} is on the way to pick you up.`,
      data: { bookingId },
    })

    return updated
  }

  async updateStatus(
    bookingId: string,
    status: BookingStatus,
    actorId: string,
    note?: string
  ) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new Error('Booking not found')

    const updateData: Prisma.BookingUpdateInput = { status }
    if (status === BookingStatus.IN_PROGRESS) updateData.startedAt = new Date()
    if (status === BookingStatus.COMPLETED) updateData.completedAt = new Date()
    if (status === BookingStatus.CANCELLED) updateData.cancelledAt = new Date()

    const updated = await prisma.booking.update({ where: { id: bookingId }, data: updateData })

    await prisma.bookingStatusHistory.create({
      data: { bookingId, status, actorId, note },
    })

    if (status === BookingStatus.COMPLETED && booking.driverId) {
      await this.processTripCompletion(booking.id, booking.driverId)
    }

    const eventMap: Record<string, string> = {
      DRIVER_ARRIVED: 'driver_arrived',
      IN_PROGRESS: 'trip_started',
      COMPLETED: 'trip_completed',
      CANCELLED: 'booking_cancelled',
    }

    const event = eventMap[status]
    if (event) {
      emitToUser(booking.passengerId, event, { bookingId })
      if (booking.driverId) {
        const dp = await prisma.driverProfile.findUnique({ where: { id: booking.driverId } })
        if (dp) emitToUser(dp.userId, event, { bookingId })
      }
    }

    return updated
  }

  private async processTripCompletion(bookingId: string, driverProfileId: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking?.driverEarnings) return

    const driverProfile = await prisma.driverProfile.findUnique({ where: { id: driverProfileId } })
    if (!driverProfile) return

    const wallet = await prisma.wallet.findUnique({ where: { userId: driverProfile.userId } })
    if (wallet) {
      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: booking.driverEarnings } },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'CREDIT',
            amount: booking.driverEarnings,
            balance: wallet.balance + booking.driverEarnings,
            description: `Trip earnings - Booking #${bookingId.slice(-8)}`,
            bookingId,
          },
        }),
        prisma.driverProfile.update({
          where: { id: driverProfileId },
          data: {
            totalTrips: { increment: 1 },
            totalEarnings: { increment: booking.driverEarnings },
          },
        }),
      ])
    }
  }

  async getBookingById(id: string) {
    return prisma.booking.findUnique({
      where: { id },
      include: {
        passenger: { select: { id: true, fullName: true, phone: true, rating: true, profilePhoto: true } },
        driver: { include: { user: { select: { id: true, fullName: true, phone: true, rating: true, profilePhoto: true } } } },
        vehicle: true,
        category: true,
        offers: { include: { driver: { include: { user: { select: { id: true, fullName: true, rating: true } } } } } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payment: true,
        ratings: true,
      },
    })
  }

  async listPassengerBookings(passengerId: string, page: number, limit: number) {
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where: { passengerId },
        include: { category: true, vehicle: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where: { passengerId } }),
    ])
    return { data, total }
  }

  async listDriverBookings(driverProfileId: string, page: number, limit: number) {
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where: { driverId: driverProfileId },
        include: { category: true, passenger: { select: { id: true, fullName: true, phone: true, rating: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where: { driverId: driverProfileId } }),
    ])
    return { data, total }
  }

  async cancelBooking(bookingId: string, userId: string, reason: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new Error('Booking not found')

    const cancellable: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.SEARCHING,
      BookingStatus.OFFER_RECEIVED,
      BookingStatus.ACCEPTED,
      BookingStatus.DRIVER_ASSIGNED,
      BookingStatus.DRIVER_EN_ROUTE,
    ]
    if (!cancellable.includes(booking.status)) {
      throw new Error('Cannot cancel booking at this stage')
    }

    return this.updateStatus(bookingId, BookingStatus.CANCELLED, userId, reason)
  }
}

export const bookingService = new BookingService()
