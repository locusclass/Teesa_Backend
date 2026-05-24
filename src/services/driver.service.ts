import { prisma } from '../db/client'
import { DriverStatus, VehicleStatus } from '@prisma/client'
import { notificationService } from './notification.service'

export class DriverService {
  async createOrUpdateProfile(userId: string, data: {
    nationalIdNo?: string
    licenseNo?: string
    licenseExpiry?: Date
    serviceAreas?: string[]
  }) {
    return prisma.driverProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    })
  }

  async setOnlineStatus(userId: string, isOnline: boolean, lat?: number, lng?: number) {
    const profile = await prisma.driverProfile.findUnique({ where: { userId } })
    if (!profile) throw new Error('Driver profile not found')
    if (profile.status !== DriverStatus.APPROVED) throw new Error('Driver not approved')

    const update: Record<string, unknown> = { isOnline }
    if (isOnline && lat !== undefined && lng !== undefined) {
      update.currentLat = lat
      update.currentLng = lng
    }

    return prisma.driverProfile.update({ where: { userId }, data: update })
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const profile = await prisma.driverProfile.findUnique({ where: { userId } })
    if (!profile || !profile.isOnline) return

    await prisma.driverProfile.update({
      where: { userId },
      data: { currentLat: lat, currentLng: lng },
    })

    await prisma.driverLocation.create({
      data: { driverProfileId: profile.id, lat, lng },
    })

    return { lat, lng }
  }

  async getNearbyDrivers(lat: number, lng: number, categoryId?: string, radiusKm = 10) {
    const profiles = await prisma.driverProfile.findMany({
      where: {
        isOnline: true,
        status: DriverStatus.APPROVED,
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: {
        user: { select: { id: true, fullName: true, rating: true, profilePhoto: true } },
        vehicles: {
          where: {
            isActive: true,
            verificationStatus: VehicleStatus.APPROVED,
            ...(categoryId ? { categoryId } : {}),
          },
          take: 1,
        },
      },
    })

    const R = 6371
    const nearby = profiles.filter((p) => {
      if (!p.currentLat || !p.currentLng) return false
      const dLat = ((p.currentLat - lat) * Math.PI) / 180
      const dLon = ((p.currentLng - lng) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) * Math.cos((p.currentLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
      const dist = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return dist <= radiusKm && p.vehicles.length > 0
    })

    return nearby
  }

  async approveDriver(driverProfileId: string, adminId: string) {
    const profile = await prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { status: DriverStatus.APPROVED, approvedAt: new Date(), approvedBy: adminId },
      include: { user: true },
    })

    await notificationService.createNotification({
      userId: profile.userId,
      type: 'ACCOUNT_APPROVED',
      title: 'Account Approved!',
      body: 'Your driver account has been approved. You can now go online and accept trips.',
      data: {},
    })

    return profile
  }

  async rejectDriver(driverProfileId: string, adminId: string, reason: string) {
    const profile = await prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: {
        status: DriverStatus.REJECTED,
        approvedBy: adminId,
        rejectionReason: reason,
      },
      include: { user: true },
    })

    await notificationService.createNotification({
      userId: profile.userId,
      type: 'ACCOUNT_REJECTED',
      title: 'Application Not Approved',
      body: `Your driver application was not approved: ${reason}`,
      data: {},
    })

    return profile
  }

  async getPendingDrivers(page: number, limit: number) {
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.driverProfile.findMany({
        where: { status: DriverStatus.PENDING },
        include: {
          user: { select: { id: true, fullName: true, phone: true, email: true, createdAt: true } },
          vehicles: { include: { category: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.driverProfile.count({ where: { status: DriverStatus.PENDING } }),
    ])
    return { data, total }
  }

  async getDriverProfile(userId: string) {
    return prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, rating: true, profilePhoto: true } },
        vehicles: { include: { category: true, documents: true } },
        vehicleDocuments: true,
      },
    })
  }
}

export const driverService = new DriverService()
