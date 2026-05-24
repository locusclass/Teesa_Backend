import crypto from 'crypto'
import { prisma } from '../db/client'
import { env } from '../config/env'

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function createOtp(phone: string, purpose: string, userId?: string): Promise<string> {
  const code = generateOtp()
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000)

  await prisma.otpCode.updateMany({
    where: { phone, purpose, usedAt: null },
    data: { usedAt: new Date() },
  })

  await prisma.otpCode.create({
    data: { phone, code, purpose, expiresAt, userId },
  })

  return code
}

export async function verifyOtp(phone: string, code: string, purpose: string): Promise<boolean> {
  const record = await prisma.otpCode.findFirst({
    where: {
      phone,
      code,
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  })

  if (!record) return false

  if (record.attempts >= env.OTP_MAX_ATTEMPTS) return false

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })

  return true
}

export async function incrementOtpAttempts(phone: string, purpose: string): Promise<void> {
  await prisma.otpCode.updateMany({
    where: { phone, purpose, usedAt: null },
    data: { attempts: { increment: 1 } },
  })
}
