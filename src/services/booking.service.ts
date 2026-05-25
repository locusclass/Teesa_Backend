import { prisma } from '../db/client'
import { BookingType, BookingStatus, Prisma } from '@prisma/client'
import { getDistanceAndDuration, haversineDistance } from '../integrations/maps'
import { emitToUser, emitToDrivers } from '../realtime/socketServer'
import { notificationService } from './notification.service'
import { surgeService } from './surge.service'

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

const DISPATCH_RADIUS_KM = 15

export class BookingService {
  async createBooking(input: CreateBookingInput) {
    const category = await prisma.transportCategory.findUnique({ where: { id: input.categoryId } })
    if (!category) throw new Error('Category not found')

    let distanceKm: number | undefined
    let estimatedMinutes: number | undefined
    let estimatedFare: number | undefined
    let surgeMultiplier = 1.0

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
        surgeMultiplier = await surgeService.getSurgeMultiplier(input.categoryId)
        const rawFare = pricing.baseFare + distanceKm * pricing.perKmRate + estimatedMinutes * pricing.perMinuteRate
        const baseFare = Math.max(rawFare, pricing.minimumFare)
        estimatedFare = Math.round(baseFare * surgeMultiplier)
        if (pricing.vipMultiplier && pricing.vipMultiplier > 1) {
          estimatedFare = Math.round(estimatedFare * pricing.vipMultiplier)
        }
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

    const payload = {
      bookingId: booking.id,
      categoryId: input.categoryId,
      categoryName: category.name,
      pickupAddress: input.pickupAddress,
      destAddress: input.destAddress,
      estimatedFare,
      surgeMultiplier,
      isUrgent: input.isUrgent,
      distanceKm,
      estimatedMinutes,
    }

    if (input.bookingType === BookingType.INSTANT) {
      await this.dispatchToNearbyDrivers(
        input.categoryId, input.pickupLat, input.pickupLng, 'new_instant_request', payload
      )
    } else if (input.bookingType === BookingType.NEGOTIATED) {
      emitToDrivers('new_negotiated_request', {
        ...payload,
        proposedBudget: input.proposedBudget,
        deadline: input.negotiationDeadline,
      })
    }

    return { ...booking, surgeMultiplier }
  }

  private async dispatchToNearbyDrivers(
    categoryId: string,
    pickupLat: number | undefined,
    pickupLng: number | undefined,
    event: string,
    payload: unknown
  ) {
    if (!pickupLat || !pickupLng) {
      emitToDrivers(event, payload)
      return
    }

    const onlineDrivers = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        status: 'APPROVED',
        currentLat: { not: null },
        currentLng: { not: null },
        vehicles: {
          some: { categoryId, isActive: true, verificationStatus: 'APPROVED' },
        },
      },
      select: { userId: true, currentLat: true, currentLng: true },
    })

    const nearby = onlineDrivers.filter(d => {
      if (!d.currentLat || !d.currentLng) return false
      return haversineDistance(pickupLat, pickupLng, d.currentLat, d.currentLng) <= DISPATCH_RADIUS_KM
    })

    if (nearby.length > 0) {
      for (const driver of nearby) {
        emitToUser(driver.userId, event, payload)
      }
    } else {
      emitToDrivers(event, payload)
    }
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
        await prisma.bookingOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })
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

  async updateStatus(bookingId: string, status: BookingStatus, actorId: string, note?: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new Error('Booking not found')

    const updateData: Prisma.BookingUpdateInput = { status }
    if (status === BookingStatus.DRIVER_EN_ROUTE) updateData.acceptedAt = updateData.acceptedAt || new Date()
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
      DRIVER_EN_ROUTE: 'booking_accepted',
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

    if (status === BookingStatus.COMPLETED) {
      await notificationService.createNotification({
        userId: booking.passengerId,
        type: 'TRIP_COMPLETED',
        title: 'Trip Completed',
        body: 'Your trip has been completed. Rate your driver!',
        data: { bookingId },
      })
    }

    return updated
  }

  private async processTripCompletion(bookingId: string, driverProfileId: string) {
    const [booking, driverProfile] = await Promise.all([
      prisma.booking.findUnique({ where: { id: bookingId } }),
      prisma.driverProfile.findUnique({ where: { id: driverProfileId } }),
    ])
    if (!booking?.driverEarnings || !driverProfile) return

    await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { userId: driverProfile.userId },
        data: { balance: { increment: booking.driverEarnings! } },
      })

      await tx.walletTransaction.create({
        data: {
          walletId: updatedWallet.id,
          type: 'CREDIT',
          amount: booking.driverEarnings!,
          balance: updatedWallet.balance,
          description: `Trip earnings - Booking #${bookingId.slice(-8).toUpperCase()}`,
          bookingId,
        },
      })

      await tx.driverProfile.update({
        where: { id: driverProfileId },
        data: {
          totalTrips: { increment: 1 },
          totalEarnings: { increment: booking.driverEarnings! },
        },
      })
    })

    await notificationService.createNotification({
      userId: driverProfile.userId,
      type: 'PAYMENT_RECEIVED',
      title: 'Earnings Credited',
      body: `UGX ${booking.driverEarnings!.toLocaleString()} added to your wallet.`,
      data: { bookingId },
    })
  }

  async getBookingById(id: string) {
    return prisma.booking.findUnique({
      where: { id },
      include: {
        passenger: { select: { id: true, fullName: true, phone: true, rating: true, profilePhoto: true } },
        driver: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, rating: true, profilePhoto: true } },
            vehicles: { where: { isActive: true }, take: 1, include: { category: true } },
          },
        },
        vehicle: true,
        category: true,
        offers: {
          include: { driver: { include: { user: { select: { id: true, fullName: true, rating: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payment: true,
        ratings: true,
      },
    })
  }

  async getActiveBooking(userId: string) {
    return prisma.booking.findFirst({
      where: {
        passengerId: userId,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.SEARCHING,
            BookingStatus.OFFER_RECEIVED,
            BookingStatus.ACCEPTED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.DRIVER_ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
      include: {
        category: true,
        driver: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, rating: true, profilePhoto: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getActiveDriverBooking(driverProfileId: string) {
    return prisma.booking.findFirst({
      where: {
        driverId: driverProfileId,
        status: {
          in: [
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.DRIVER_ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
      include: {
        category: true,
        passenger: { select: { id: true, fullName: true, phone: true, rating: true } },
      },
      orderBy: { createdAt: 'desc' },
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
        include: {
          category: true,
          passenger: { select: { id: true, fullName: true, phone: true, rating: true } },
        },
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

    await prisma.booking.update({
      where: { id: bookingId },
      data: { cancellationReason: reason },
    })

    return this.updateStatus(bookingId, BookingStatus.CANCELLED, userId, reason)
  }

  async triggerSOS(bookingId: string, userId: string, lat?: number, lng?: number) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new Error('Booking not found')

    const { emitToAdmins } = await import('../realtime/socketServer')
    emitToAdmins('sos_alert', {
      bookingId,
      userId,
      lat,
      lng,
      timestamp: new Date().toISOString(),
      passengerName: booking.passengerId,
    })

    await notificationService.createNotification({
      userId,
      type: 'GENERAL',
      title: 'SOS Alert Sent',
      body: 'Our safety team has been notified and will contact you shortly.',
      data: { bookingId },
    })

    return { sent: true }
  }
}

export const bookingService = new BookingService()
