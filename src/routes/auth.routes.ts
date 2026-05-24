import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authService } from '../services/auth.service'
import { authenticate } from '../middleware/auth'
import { success, error } from '../utils/response'

export async function authRoutes(app: FastifyInstance) {
  app.post('/send-otp', {
    schema: {
      tags: ['Auth'],
      description: 'Send OTP to phone number',
      body: { type: 'object', required: ['phone', 'purpose'], properties: {
        phone: { type: 'string' }, purpose: { type: 'string', enum: ['register', 'login', 'reset'] }
      }},
    },
  }, async (req, reply) => {
    const { phone, purpose } = req.body as { phone: string; purpose: string }
    await authService.sendOtp(phone, purpose)
    return reply.send(success(null, 'OTP sent successfully'))
  })

  app.post('/register', {
    schema: {
      tags: ['Auth'],
      description: 'Register a new user with OTP verification',
      body: { type: 'object', required: ['phone', 'fullName', 'otp'], properties: {
        phone: { type: 'string' }, fullName: { type: 'string' },
        email: { type: 'string' }, password: { type: 'string' },
        otp: { type: 'string' }, role: { type: 'string' }
      }},
    },
  }, async (req, reply) => {
    try {
      const body = req.body as {
        phone: string; fullName: string; otp: string;
        email?: string; password?: string; role?: string
      }
      const result = await authService.registerWithOtp(
        { ...body, role: body.role as import('@prisma/client').UserRole | undefined },
        body.otp,
      )
      return reply.code(201).send(success(result, 'Registration successful'))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.post('/login/password', {
    schema: { tags: ['Auth'], description: 'Login with phone/email and password' },
  }, async (req, reply) => {
    try {
      const body = req.body as { phone?: string; email?: string; password: string }
      const result = await authService.loginWithPassword(body)
      return reply.send(success(result, 'Login successful'))
    } catch (err: unknown) {
      return reply.code(401).send(error((err as Error).message))
    }
  })

  app.post('/login/otp', {
    schema: { tags: ['Auth'], description: 'Login with OTP' },
  }, async (req, reply) => {
    try {
      const { phone, otp } = req.body as { phone: string; otp: string }
      const result = await authService.loginWithOtp(phone, otp)
      return reply.send(success(result, 'Login successful'))
    } catch (err: unknown) {
      return reply.code(401).send(error((err as Error).message))
    }
  })

  app.post('/refresh', {
    schema: { tags: ['Auth'], description: 'Refresh access token' },
  }, async (req, reply) => {
    try {
      const { refreshToken } = req.body as { refreshToken: string }
      const result = await authService.refreshTokens(refreshToken)
      return reply.send(success(result))
    } catch (err: unknown) {
      return reply.code(401).send(error((err as Error).message))
    }
  })

  app.post('/logout', {
    preHandler: authenticate,
    schema: { tags: ['Auth'], description: 'Logout' },
  }, async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken: string }
    await authService.logout(refreshToken)
    return reply.send(success(null, 'Logged out successfully'))
  })
}
