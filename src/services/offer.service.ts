import { prisma } from '../db/client'
import { OfferStatus, BookingStatus } from '@prisma/client'
import { emitToUser } from '../realtime/socketServer'
import { notificationService } from './notification.service'

export class OfferService {
  async submitOffer(bookingId: string, driverProfileId: string, offeredFare: number, message?: string) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new Error('Booking not found')
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.SEARCHING) {
      throw new Error('Booking is not accepting offers')
    }

    const existing = await prisma.bookingOffer.findFirst({
      where: { bookingId, driverProfileId, status: OfferStatus.PENDING },
    })
    if (existing) throw new Error('You have already submitted an offer')

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
    const offer = await prisma.bookingOffer.create({
      data: { bookingId, driverProfileId, offeredFare, message, expiresAt },
    })

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.OFFER_RECEIVED },
    })

    const dp = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: { user: { select: { fullName: true, rating: true } } },
    })

    emitToUser(booking.passengerId, 'offer_received', {
      bookingId,
      offerId: offer.id,
      driver: { id: driverProfileId, name: dp?.user.fullName, rating: dp?.user.rating },
      offeredFare,
      message,
    })

    await notificationService.createNotification({
      userId: booking.passengerId,
      type: 'OFFER_RECEIVED',
      title: 'New Offer Received',
      body: `${dp?.user.fullName} offered UGX ${offeredFare.toLocaleString()} for your trip.`,
      data: { bookingId, offerId: offer.id },
    })

    return offer
  }

  async submitCounterOffer(
    originalOfferId: string,
    passengerId: string,
    counterFare: number,
    message?: string
  ) {
    const original = await prisma.bookingOffer.findUnique({ where: { id: originalOfferId } })
    if (!original) throw new Error('Original offer not found')

    const booking = await prisma.booking.findUnique({ where: { id: original.bookingId } })
    if (!booking || booking.passengerId !== passengerId) throw new Error('Unauthorized')

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const counter = await prisma.bookingOffer.create({
      data: {
        bookingId: original.bookingId,
        driverProfileId: original.driverProfileId,
        offeredFare: counterFare,
        message,
        expiresAt,
        parentOfferId: originalOfferId,
        status: OfferStatus.COUNTER_OFFERED,
      },
    })

    await prisma.bookingOffer.update({
      where: { id: originalOfferId },
      data: { status: OfferStatus.COUNTER_OFFERED },
    })

    const dp = await prisma.driverProfile.findUnique({
      where: { id: original.driverProfileId },
      include: { user: true },
    })

    if (dp) {
      emitToUser(dp.userId, 'counter_offer_received', {
        bookingId: original.bookingId,
        counterOfferId: counter.id,
        counterFare,
        message,
      })
    }

    return counter
  }

  async acceptOffer(offerId: string, passengerId: string) {
    const offer = await prisma.bookingOffer.findUnique({
      where: { id: offerId },
      include: { booking: true, driver: { include: { user: true } } },
    })
    if (!offer) throw new Error('Offer not found')
    if (offer.booking.passengerId !== passengerId) throw new Error('Unauthorized')
    if (offer.status !== OfferStatus.PENDING && offer.status !== OfferStatus.COUNTER_OFFERED) {
      throw new Error('Offer is no longer active')
    }

    await prisma.bookingOffer.update({ where: { id: offerId }, data: { status: OfferStatus.ACCEPTED } })
    await prisma.bookingOffer.updateMany({
      where: { bookingId: offer.bookingId, id: { not: offerId } },
      data: { status: OfferStatus.REJECTED },
    })

    const pricing = await prisma.pricingRule.findFirst({
      where: { categoryId: offer.booking.categoryId, isActive: true },
    })
    const commission = pricing?.platformCommission || 0.15
    const platformFee = Math.round(offer.offeredFare * commission)
    const driverEarnings = Math.round(offer.offeredFare - platformFee)

    await prisma.booking.update({
      where: { id: offer.bookingId },
      data: {
        driverId: offer.driverProfileId,
        status: BookingStatus.DRIVER_ASSIGNED,
        acceptedAt: new Date(),
        finalFare: offer.offeredFare,
        platformFee,
        driverEarnings,
      },
    })

    await prisma.bookingStatusHistory.create({
      data: { bookingId: offer.bookingId, status: BookingStatus.DRIVER_ASSIGNED, actorId: passengerId },
    })

    emitToUser(offer.driver.userId, 'offer_accepted', {
      bookingId: offer.bookingId,
      offerId,
    })

    await notificationService.createNotification({
      userId: offer.driver.userId,
      type: 'OFFER_ACCEPTED',
      title: 'Offer Accepted!',
      body: `Your offer of UGX ${offer.offeredFare.toLocaleString()} was accepted.`,
      data: { bookingId: offer.bookingId },
    })

    return offer
  }

  async getBookingOffers(bookingId: string) {
    return prisma.bookingOffer.findMany({
      where: { bookingId },
      include: {
        driver: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, rating: true, profilePhoto: true } },
            vehicles: { where: { isActive: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async withdrawOffer(offerId: string, driverProfileId: string) {
    const offer = await prisma.bookingOffer.findUnique({ where: { id: offerId } })
    if (!offer || offer.driverProfileId !== driverProfileId) throw new Error('Offer not found')
    if (offer.status !== OfferStatus.PENDING) throw new Error('Cannot withdraw this offer')
    return prisma.bookingOffer.update({ where: { id: offerId }, data: { status: OfferStatus.WITHDRAWN } })
  }
}

export const offerService = new OfferService()
