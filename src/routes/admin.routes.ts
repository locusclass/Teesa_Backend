import { FastifyInstance } from 'fastify'
import { requireAdmin, requireSuperAdmin, JwtPayload } from '../middleware/auth'
import { prisma } from '../db/client'
import { driverService } from '../services/driver.service'
import { success, error, paginated, parsePagination } from '../utils/response'
import { audit } from '../utils/audit'

export async function adminRoutes(app: FastifyInstance) {
  // Dashboard metrics
  app.get('/dashboard', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Get admin dashboard metrics', security: [{ Bearer: [] }] },
  }, async (_req, reply) => {
    const [
      totalUsers, totalDrivers, totalBookings, activeTrips,
      completedToday, totalRevenue, pendingDrivers, pendingWithdrawals, openDisputes
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'PASSENGER' } }),
      prisma.driverProfile.count(),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.booking.count({
        where: { status: 'COMPLETED', completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
      }),
      prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { platformFee: true } }),
      prisma.driverProfile.count({ where: { status: 'PENDING' } }),
      prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    ])

    return reply.send(success({
      totalUsers, totalDrivers, totalBookings, activeTrips,
      completedToday, platformRevenue: totalRevenue._sum.platformFee || 0,
      pendingDrivers, pendingWithdrawals, openDisputes,
    }))
  })

  // Driver approvals
  app.get('/drivers/pending', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Get pending driver approvals', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const { data, total } = await driverService.getPendingDrivers(page, limit)
    return reply.send(paginated(data, total, page, limit))
  })

  app.post('/drivers/:driverProfileId/approve', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Approve driver', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { driverProfileId } = req.params as { driverProfileId: string }
      const profile = await driverService.approveDriver(driverProfileId, user.sub)
      await audit({ actorId: user.sub, action: 'approve_driver', entity: 'DriverProfile', entityId: driverProfileId })
      return reply.send(success(profile))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.post('/drivers/:driverProfileId/reject', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Reject driver', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { driverProfileId } = req.params as { driverProfileId: string }
      const { reason } = req.body as { reason: string }
      const profile = await driverService.rejectDriver(driverProfileId, user.sub, reason)
      await audit({ actorId: user.sub, action: 'reject_driver', entity: 'DriverProfile', entityId: driverProfileId, metadata: { reason } })
      return reply.send(success(profile))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  // Vehicle approvals
  app.get('/vehicles/pending', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Get pending vehicle approvals', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.vehicle.findMany({
        where: { verificationStatus: 'PENDING' },
        include: { category: true, owner: { include: { user: { select: { id: true, fullName: true, phone: true } } } }, documents: true },
        skip, take: limit, orderBy: { createdAt: 'asc' },
      }),
      prisma.vehicle.count({ where: { verificationStatus: 'PENDING' } }),
    ])
    return reply.send(paginated(data, total, page, limit))
  })

  app.post('/vehicles/:vehicleId/approve', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Approve vehicle', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { vehicleId } = req.params as { vehicleId: string }
      const vehicle = await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { verificationStatus: 'APPROVED' },
      })
      await audit({ actorId: user.sub, action: 'approve_vehicle', entity: 'Vehicle', entityId: vehicleId })
      return reply.send(success(vehicle))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  // User management
  app.get('/users', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'List users', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, fullName: true, phone: true, email: true, role: true, accountStatus: true, rating: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.user.count(),
    ])
    return reply.send(paginated(data, total, page, limit))
  })

  app.patch('/users/:userId/suspend', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Suspend user', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { userId } = req.params as { userId: string }
      const { reason } = req.body as { reason: string }
      await prisma.user.update({ where: { id: userId }, data: { accountStatus: 'SUSPENDED' } })
      await audit({ actorId: user.sub, action: 'suspend_user', entity: 'User', entityId: userId, metadata: { reason } })
      return reply.send(success(null, 'User suspended'))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  // Live bookings
  app.get('/bookings/live', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Get live bookings', security: [{ Bearer: [] }] },
  }, async (_req, reply) => {
    const live = await prisma.booking.findMany({
      where: { status: { in: ['IN_PROGRESS', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'] } },
      include: {
        passenger: { select: { id: true, fullName: true, phone: true } },
        driver: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
        category: true,
      },
    })
    return reply.send(success(live))
  })

  // All bookings
  app.get('/bookings', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'List all bookings', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        include: { category: true, passenger: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.booking.count(),
    ])
    return reply.send(paginated(data, total, page, limit))
  })

  // Disputes
  app.get('/disputes', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'List disputes', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.dispute.findMany({
        include: {
          booking: { select: { id: true, status: true } },
          openedBy: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.dispute.count(),
    ])
    return reply.send(paginated(data, total, page, limit))
  })

  // Audit logs
  app.get('/audit-logs', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Get audit logs', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        include: { actor: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.adminAuditLog.count(),
    ])
    return reply.send(paginated(data, total, page, limit))
  })

  // System settings
  app.get('/settings', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Get system settings', security: [{ Bearer: [] }] },
  }, async (_req, reply) => {
    const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } })
    return reply.send(success(settings))
  })

  app.patch('/settings/:key', {
    preHandler: requireAdmin(),
    schema: { tags: ['Admin'], description: 'Update system setting', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { key } = req.params as { key: string }
      const { value } = req.body as { value: string }
      const setting = await prisma.systemSetting.update({
        where: { key },
        data: { value, updatedBy: user.sub },
      })
      await audit({ actorId: user.sub, action: 'update_setting', entity: 'SystemSetting', entityId: key, metadata: { value } })
      return reply.send(success(setting))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  // Admin management (super admin only)
  app.post('/admins', {
    preHandler: requireSuperAdmin(),
    schema: { tags: ['Admin'], description: 'Create admin user (super admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const actor = req.user as JwtPayload
      const body = req.body as { phone: string; email: string; fullName: string; role: string }
      const existing = await prisma.user.findFirst({
        where: { OR: [{ phone: body.phone }, { email: body.email }] },
      })
      if (existing) return reply.code(409).send(error('User already exists'))

      const bcrypt = await import('bcryptjs')
      const tempPassword = Math.random().toString(36).slice(-10)
      const hash = await bcrypt.default.hash(tempPassword, 12)

      const admin = await prisma.user.create({
        data: {
          phone: body.phone, email: body.email, fullName: body.fullName,
          passwordHash: hash, role: body.role as import('@prisma/client').UserRole,
          accountStatus: 'ACTIVE',
        },
      })
      await audit({ actorId: actor.sub, action: 'create_admin', entity: 'User', entityId: admin.id })
      return reply.code(201).send(success({ ...admin, tempPassword, passwordHash: undefined }))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
