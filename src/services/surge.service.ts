import { prisma } from '../db/client'

interface CacheEntry {
  multiplier: number
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export class SurgeService {
  async getSurgeMultiplier(categoryId: string): Promise<number> {
    const cached = cache.get(categoryId)
    if (cached && cached.expiresAt > Date.now()) return cached.multiplier

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)

    const [activeRequests, availableDrivers] = await Promise.all([
      prisma.booking.count({
        where: {
          categoryId,
          status: { in: ['PENDING', 'SEARCHING'] },
          createdAt: { gte: fiveMinAgo },
        },
      }),
      prisma.driverProfile.count({
        where: { isOnline: true, status: 'APPROVED' },
      }),
    ])

    let multiplier = 1.0
    if (availableDrivers === 0) {
      multiplier = 2.0
    } else {
      const ratio = activeRequests / availableDrivers
      if (ratio >= 2.0) multiplier = 2.0
      else if (ratio >= 1.5) multiplier = 1.8
      else if (ratio >= 1.0) multiplier = 1.5
      else if (ratio >= 0.5) multiplier = 1.2
    }

    cache.set(categoryId, { multiplier, expiresAt: Date.now() + 60_000 })
    return multiplier
  }
}

export const surgeService = new SurgeService()
