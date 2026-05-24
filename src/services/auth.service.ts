import bcrypt from 'bcryptjs'
import { prisma } from '../db/client'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt'
import { createOtp, verifyOtp } from '../utils/otp'
import { sendOtpSms } from '../integrations/sms'
import { UserRole, AccountStatus } from '@prisma/client'

export interface RegisterInput {
  phone: string
  fullName: string
  email?: string
  password?: string
  role?: UserRole
}

export interface LoginInput {
  phone?: string
  email?: string
  password?: string
}

export class AuthService {
  async sendOtp(phone: string, purpose: string) {
    let user = await prisma.user.findUnique({ where: { phone } })
    const code = await createOtp(phone, purpose, user?.id)
    await sendOtpSms(phone, code)
    return { sent: true }
  }

  async registerWithOtp(input: RegisterInput, otp: string) {
    const verified = await verifyOtp(input.phone, otp, 'register')
    if (!verified) throw new Error('Invalid or expired OTP')

    const existing = await prisma.user.findUnique({ where: { phone: input.phone } })
    if (existing) throw new Error('Phone number already registered')

    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined

    const user = await prisma.user.create({
      data: {
        phone: input.phone,
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: input.role || UserRole.PASSENGER,
        accountStatus: AccountStatus.ACTIVE,
      },
    })

    await prisma.wallet.create({ data: { userId: user.id, balance: 0, currency: 'UGX' } })

    const accessToken = signAccessToken(user.id, user.role)
    const refreshToken = signRefreshToken(user.id, user.role)
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    return { accessToken, refreshToken, user: this.sanitizeUser(user) }
  }

  async loginWithPassword(input: LoginInput) {
    const user = input.phone
      ? await prisma.user.findUnique({ where: { phone: input.phone } })
      : await prisma.user.findUnique({ where: { email: input.email } })

    if (!user) throw new Error('Invalid credentials')
    if (!user.passwordHash || !input.password) throw new Error('Password not set')
    if (user.accountStatus !== AccountStatus.ACTIVE) throw new Error('Account suspended or not active')

    const match = await bcrypt.compare(input.password, user.passwordHash)
    if (!match) throw new Error('Invalid credentials')

    const accessToken = signAccessToken(user.id, user.role)
    const refreshToken = signRefreshToken(user.id, user.role)
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    return { accessToken, refreshToken, user: this.sanitizeUser(user) }
  }

  async loginWithOtp(phone: string, otp: string) {
    const verified = await verifyOtp(phone, otp, 'login')
    if (!verified) throw new Error('Invalid or expired OTP')

    const user = await prisma.user.findUnique({ where: { phone } })
    if (!user) throw new Error('User not found')
    if (user.accountStatus !== AccountStatus.ACTIVE) throw new Error('Account not active')

    const accessToken = signAccessToken(user.id, user.role)
    const refreshToken = signRefreshToken(user.id, user.role)
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    return { accessToken, refreshToken, user: this.sanitizeUser(user) }
  }

  async refreshTokens(token: string) {
    let payload: ReturnType<typeof verifyRefreshToken>
    try {
      payload = verifyRefreshToken(token)
    } catch {
      throw new Error('Invalid refresh token')
    }

    if (payload.type !== 'refresh') throw new Error('Invalid token type')

    const session = await prisma.authSession.findUnique({ where: { refreshToken: token } })
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new Error('Refresh token expired or revoked')
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) throw new Error('User not found')

    await prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } })

    const newAccess = signAccessToken(user.id, user.role)
    const newRefresh = signRefreshToken(user.id, user.role)
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshToken: newRefresh,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    return { accessToken: newAccess, refreshToken: newRefresh }
  }

  async logout(refreshToken: string) {
    await prisma.authSession.updateMany({
      where: { refreshToken },
      data: { revokedAt: new Date() },
    })
    return { success: true }
  }

  private sanitizeUser(user: { id: string; phone: string; email: string | null; fullName: string; role: UserRole; accountStatus: AccountStatus; rating: number }) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      accountStatus: user.accountStatus,
      rating: user.rating,
    }
  }
}

export const authService = new AuthService()
