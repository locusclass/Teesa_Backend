import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { prisma } from '../db/client'
import { success, error, paginated, parsePagination } from '../utils/response'
import bcrypt from 'bcryptjs'

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', {
    preHandler: authenticate,
    schema: { tags: ['Users'], description: 'Get current user profile', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const profile = await prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true, phone: true, email: true, fullName: true, profilePhoto: true,
        emergencyContact: true, emergencyPhone: true, role: true,
        accountStatus: true, rating: true, ratingCount: true, createdAt: true,
        wallet: { select: { balance: true, currency: true } },
        driverProfile: { select: { id: true, status: true, isOnline: true } },
      },
    })
    if (!profile) return reply.code(404).send(error('User not found'))
    return reply.send(success(profile))
  })

  app.patch('/me', {
    preHandler: authenticate,
    schema: { tags: ['Users'], description: 'Update user profile', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const { fullName, email, emergencyContact, emergencyPhone } = req.body as {
      fullName?: string; email?: string; emergencyContact?: string; emergencyPhone?: string
    }
    const updated = await prisma.user.update({
      where: { id: user.sub },
      data: { fullName, email, emergencyContact, emergencyPhone },
      select: { id: true, phone: true, email: true, fullName: true, emergencyContact: true, emergencyPhone: true },
    })
    return reply.send(success(updated))
  })

  app.post('/me/change-password', {
    preHandler: authenticate,
    schema: { tags: ['Users'], description: 'Change password', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string }
      const dbUser = await prisma.user.findUnique({ where: { id: user.sub } })
      if (!dbUser?.passwordHash) return reply.code(400).send(error('No password set'))
      const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash)
      if (!valid) return reply.code(401).send(error('Current password incorrect'))
      const hash = await bcrypt.hash(newPassword, 12)
      await prisma.user.update({ where: { id: user.sub }, data: { passwordHash: hash } })
      return reply.send(success(null, 'Password changed'))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
