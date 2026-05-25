import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Railway injects PORT as a string; default 3000 for local dev
  PORT: z.string().default('3000').transform(Number),

  // Railway PostgreSQL plugin provides DATABASE_URL automatically
  DATABASE_URL: z.string().min(1),

  // JWT — use long random strings in Railway's variable editor
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),

  // CORS — comma-separated list, or '*' to allow all origins
  // In Railway: set to your Flutter web app's Railway URL + any custom domains
  CORS_ORIGINS: z.string().default('*'),

  // Railway Object Storage — auto-injected when you add the Object Storage service in Railway
  RAILWAY_OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  RAILWAY_OBJECT_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  RAILWAY_OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  RAILWAY_OBJECT_STORAGE_BUCKET_NAME: z.string().optional(),

  SMS_PROVIDER: z.string().default('mock'),
  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),

  MOBILE_MONEY_PROVIDER: z.string().default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  // Optional Redis — used by Socket.IO adapter when scaling horizontally
  // Railway Redis plugin sets this automatically when you add the Redis service
  REDIS_URL: z.string().url().optional(),

  // Firebase Admin — paste the full service account JSON (minified) as this env var
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // Admin bootstrap
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default('admin@teesa.ug'),
  ADMIN_BOOTSTRAP_PHONE: z.string().default('+256700000000'),

  // Rate limiting
  RATE_LIMIT_MAX: z.string().default('100').transform(Number),
  RATE_LIMIT_WINDOW: z.string().default('60000').transform(Number),

  // OTP
  OTP_EXPIRY_MINUTES: z.string().default('10').transform(Number),
  OTP_MAX_ATTEMPTS: z.string().default('3').transform(Number),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2))
  process.exit(1)
}

export const env = parsed.data

export const isDev  = env.NODE_ENV === 'development'
export const isProd = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
