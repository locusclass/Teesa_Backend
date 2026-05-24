import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/client'
import { UserRole } from '@prisma/client'

export interface JwtPayload {
  sub: string
  role: UserRole
  type: 'access' | 'refresh'
  iat: number
  exp: number
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const payload = req.user as JwtPayload
    if (payload.type !== 'access') {
      return reply.code(401).send({ error: 'Invalid token type' })
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DEACTIVATED') {
      return reply.code(401).send({ error: 'Account not active' })
    }
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply)
    const payload = req.user as JwtPayload
    if (!roles.includes(payload.role)) {
      return reply.code(403).send({ error: 'Forbidden: insufficient permissions' })
    }
  }
}

export function requireAdmin() {
  return requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN)
}

export function requireSuperAdmin() {
  return requireRole(UserRole.SUPER_ADMIN)
}

export function requireDriver() {
  return requireRole(UserRole.DRIVER, UserRole.VEHICLE_OWNER)
}
