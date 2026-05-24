import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GCS_BUCKET: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  GCP_KEY_FILE: z.string().optional(),
  SMS_PROVIDER: z.string().default('mock'),
  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),
  MOBILE_MONEY_PROVIDER: z.string().default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default('admin@teesa.ug'),
  ADMIN_BOOTSTRAP_PHONE: z.string().default('+256700000000'),
  RATE_LIMIT_MAX: z.string().default('100').transform(Number),
  RATE_LIMIT_WINDOW: z.string().default('60000').transform(Number),
  OTP_EXPIRY_MINUTES: z.string().default('10').transform(Number),
  OTP_MAX_ATTEMPTS: z.string().default('3').transform(Number),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data

export const isDev = env.NODE_ENV === 'development'
export const isProd = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
