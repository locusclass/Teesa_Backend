import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../db/client'
import { haversineDistance } from '../integrations/maps'

let io: SocketIOServer | null = null

const userSockets = new Map<string, Set<string>>()
const driverSockets = new Set<string>()
const locationRecordTimestamps = new Map<string, number>()

export function setupRealtime(httpServer: HttpServer) {
  const corsOrigin = env.CORS_ORIGINS.trim() === '*'
    ? true
    : env.CORS_ORIGINS.split(',').map(o => o.trim())

  io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    pingInterval: 20000,
    pingTimeout: 25000,
    transports: ['websocket', 'polling'],
    connectTimeout: 60000,
    allowRequest: (_req, callback) => callback(null, true),
  })

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token as string
    if (!token) return next(new Error('Authentication required'))
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string; type: string }
      if (payload.type !== 'access') return next(new Error('Invalid token'))
      socket.data.userId = payload.sub
      socket.data.role = payload.role
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId as string
    const role = socket.data.role as string

    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId)!.add(socket.id)

    socket.join(`user:${userId}`)

    if (role === 'DRIVER' || role === 'VEHICLE_OWNER') {
      socket.join('drivers')
      driverSockets.add(socket.id)

      // Restore driver to active booking room if they have one
      const dp = await prisma.driverProfile.findUnique({ where: { userId } })
      if (dp) {
        const activeBooking = await prisma.booking.findFirst({
          where: {
            driverId: dp.id,
            status: { in: ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS'] },
          },
          select: { id: true },
        })
        if (activeBooking) socket.join(`booking:${activeBooking.id}`)
      }
    }

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      socket.join('admins')
    }

    // Passenger joins their active booking room
    if (role === 'PASSENGER') {
      const activeBooking = await prisma.booking.findFirst({
        where: {
          passengerId: userId,
          status: { in: ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      })
      if (activeBooking) socket.join(`booking:${activeBooking.id}`)
    }

    socket.on('driver:location', async (data: {
      lat: number
      lng: number
      bookingId?: string
      heading?: number
      speed?: number
    }) => {
      try {
        await prisma.driverProfile.updateMany({
          where: { userId },
          data: { currentLat: data.lat, currentLng: data.lng },
        })

        const dp = await prisma.driverProfile.findUnique({ where: { userId } })
        if (!dp) return

        // Rate-limit DB writes to once per 30s per driver
        const now = Date.now()
        const lastRecord = locationRecordTimestamps.get(dp.id) || 0
        if (now - lastRecord > 30_000) {
          await prisma.driverLocation.create({
            data: {
              driverProfileId: dp.id,
              lat: data.lat,
              lng: data.lng,
              heading: data.heading,
              speed: data.speed,
              bookingId: data.bookingId,
            },
          })
          locationRecordTimestamps.set(dp.id, now)
        }

        if (data.bookingId) {
          socket.join(`booking:${data.bookingId}`)

          const booking = await prisma.booking.findUnique({
            where: { id: data.bookingId },
            select: { passengerId: true, status: true, pickupLat: true, pickupLng: true, destLat: true, destLng: true },
          })

          if (booking) {
            let etaMinutes: number | undefined

            const avgSpeedKmh = 30
            if (['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE'].includes(booking.status) &&
                booking.pickupLat && booking.pickupLng) {
              const dist = haversineDistance(data.lat, data.lng, booking.pickupLat, booking.pickupLng)
              etaMinutes = Math.max(1, Math.round((dist / avgSpeedKmh) * 60))
            } else if (booking.status === 'IN_PROGRESS' && booking.destLat && booking.destLng) {
              const dist = haversineDistance(data.lat, data.lng, booking.destLat, booking.destLng)
              etaMinutes = Math.max(1, Math.round((dist / avgSpeedKmh) * 60))
            }

            io?.to(`user:${booking.passengerId}`).emit('driver:location_update', {
              bookingId: data.bookingId,
              lat: data.lat,
              lng: data.lng,
              heading: data.heading,
              etaMinutes,
            })
          }
        }

        io?.to('admins').emit('driver:location_update', {
          driverProfileId: dp.id,
          driverUserId: userId,
          lat: data.lat,
          lng: data.lng,
          heading: data.heading,
        })
      } catch (err) {
        console.error('Location update error:', err)
      }
    })

    socket.on('driver:online', async () => {
      try {
        await prisma.driverProfile.updateMany({ where: { userId }, data: { isOnline: true } })
      } catch {}
    })

    socket.on('driver:offline', async () => {
      try {
        await prisma.driverProfile.updateMany({ where: { userId }, data: { isOnline: false } })
      } catch {}
    })

    socket.on('passenger:join_booking', (data: { bookingId: string }) => {
      if (data.bookingId) socket.join(`booking:${data.bookingId}`)
    })

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) userSockets.delete(userId)
      }
      driverSockets.delete(socket.id)
    })
  })

  console.log('Socket.IO realtime server ready')
  return io
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data)
}

export function emitToDrivers(event: string, data: unknown) {
  io?.to('drivers').emit(event, data)
}

export function emitToAdmins(event: string, data: unknown) {
  io?.to('admins').emit(event, data)
}

export function emitToBooking(bookingId: string, event: string, data: unknown) {
  io?.to(`booking:${bookingId}`).emit(event, data)
}

export function getIO() {
  return io
}
