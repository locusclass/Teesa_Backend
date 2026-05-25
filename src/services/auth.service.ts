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
    const normalizedPhone = this.normalizePhone(phone)
    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } })
    const code = await createOtp(normalizedPhone, purpose, user?.id)
    await sendOtpSms(normalizedPhone, code)
    return { sent: true }
  }

  async registerWithOtp(input: RegisterInput, otp: string) {
    const normalized = this.normalizeRegisterInput(input)
    const verified = await verifyOtp(normalized.phone, otp, 'register')
    if (!verified) throw new Error('Invalid or expired OTP')

    await this.ensureRegistrationAvailable(normalized.phone, normalized.email)
    const passwordHash = normalized.password ? await bcrypt.hash(normalized.password, 12) : undefined

    const user = await prisma.user.create({
      data: {
        phone: normalized.phone,
        fullName: normalized.fullName,
        email: normalized.email,
        passwordHash,
        role: normalized.role,
        accountStatus: AccountStatus.ACTIVE,
      },
    })

    await prisma.wallet.create({ data: { userId: user.id, balance: 0, currency: 'UGX' } })
    return this.createSession(user)
  }

  async registerWithPassword(input: RegisterInput) {
    const normalized = this.normalizeRegisterInput(input)
    if (!normalized.password || normalized.password.length < 6) {
      throw new Error('Password must be at least 6 characters')
    }

    await this.ensureRegistrationAvailable(normalized.phone, normalized.email)
    const passwordHash = await bcrypt.hash(normalized.password, 12)

    const user = await prisma.user.create({
      data: {
        phone: normalized.phone,
        fullName: normalized.fullName,
        email: normalized.email,
        passwordHash,
        role: normalized.role,
        accountStatus: AccountStatus.ACTIVE,
      },
    })

    await prisma.wallet.create({ data: { userId: user.id, balance: 0, currency: 'UGX' } })
    return this.createSession(user)
  }

  async loginWithPassword(input: LoginInput) {
    const phone = input.phone ? this.normalizePhone(input.phone) : undefined
    const email = this.normalizeEmail(input.email)
    if (!phone && !email) throw new Error('Email or phone is required')
    const user = phone
      ? await prisma.user.findUnique({ where: { phone } })
      : await prisma.user.findUnique({ where: { email } })

    if (!user) throw new Error('Invalid credentials')
    if (!user.passwordHash || !input.password) throw new Error('Password not set')
    if (user.accountStatus !== AccountStatus.ACTIVE) throw new Error('Account suspended or not active')

    const match = await bcrypt.compare(input.password, user.passwordHash)
    if (!match) throw new Error('Invalid credentials')
    return this.createSession(user)
  }

  async loginWithOtp(phone: string, otp: string) {
    const normalizedPhone = this.normalizePhone(phone)
    const verified = await verifyOtp(normalizedPhone, otp, 'login')
    if (!verified) throw new Error('Invalid or expired OTP')

    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } })
    if (!user) throw new Error('User not found')
    if (user.accountStatus !== AccountStatus.ACTIVE) throw new Error('Account not active')
    return this.createSession(user)
  }

  private async createSession(user: {
    id: string
    phone: string
    email: string | null
    fullName: string
    role: UserRole
    accountStatus: AccountStatus
    rating: number
  }) {
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

  private normalizeRegisterInput(input: RegisterInput) {
    const fullName = input.fullName.trim()
    if (!fullName) throw new Error('Full name is required')
    const phone = this.normalizePhone(input.phone)
    if (!phone) throw new Error('Phone number is required')

    return {
      phone,
      fullName,
      email: this.normalizeEmail(input.email),
      password: input.password?.trim(),
      role: input.role || UserRole.PASSENGER,
    }
  }

  private async ensureRegistrationAvailable(phone: string, email?: string) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } })
    if (existingPhone) throw new Error('Phone number already registered')

    if (!email) return
    const existingEmail = await prisma.user.findUnique({ where: { email } })
    if (existingEmail) throw new Error('Email address already registered')
  }

  private normalizePhone(phone: string) {
    return phone.replace(/\s+/g, '').trim()
  }

  private normalizeEmail(email?: string) {
    const normalized = email?.trim().toLowerCase()
    return normalized ? normalized : undefined
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
