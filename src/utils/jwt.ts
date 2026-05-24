import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UserRole } from '@prisma/client'

interface TokenPayload {
  sub: string
  role: UserRole
  type: 'access' | 'refresh'
}

export function signAccessToken(userId: string, role: UserRole): string {
  return jwt.sign(
    { sub: userId, role, type: 'access' },
    env.JWT_SECRET,
    // jsonwebtoken's expiresIn expects ms.StringValue; cast through unknown to satisfy strict TS
    { expiresIn: env.ACCESS_TOKEN_TTL as unknown as number }
  )
}

export function signRefreshToken(userId: string, role: UserRole): string {
  return jwt.sign(
    { sub: userId, role, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_TTL as unknown as number }
  )
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload
  } catch {
    return null
  }
}
