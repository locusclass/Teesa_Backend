import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../db/client'

let io: SocketIOServer | null = null

const userSockets = new Map<string, Set<string>>()
const driverSockets = new Set<string>()

export function setupRealtime(httpServer: HttpServer) {
  const corsOrigin = env.CORS_ORIGINS.trim() === '*'
    ? true
    : env.CORS_ORIGINS.split(',').map(o => o.trim())

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    // Railway's proxy has a 30s idle timeout for WebSocket connections.
    // pingInterval must be < 30s so the ping keeps the connection alive.
    pingInterval: 20000,
    pingTimeout: 25000,
    // Allow both transports; Railway supports native WebSockets
    transports: ['websocket', 'polling'],
    // Allow clients 60s to reconnect before dropping their room state
    connectTimeout: 60000,
    // Railway proxy sets X-Forwarded-For; trust it for accurate IP
    allowRequest: (req, callback) => {
      callback(null, true)
    },
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
    }

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      socket.join('admins')
    }

    socket.on('driver:location', async (data: { lat: number; lng: number; bookingId?: string }) => {
      try {
        await prisma.driverProfile.updateMany({
          where: { userId },
          data: { currentLat: data.lat, currentLng: data.lng },
        })
        const dp = await prisma.driverProfile.findUnique({ where: { userId } })
        if (dp) {
          await prisma.driverLocation.create({
            data: { driverProfileId: dp.id, lat: data.lat, lng: data.lng },
          })
          if (data.bookingId) {
            const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } })
            if (booking) {
              io?.to(`user:${booking.passengerId}`).emit('driver:location_update', {
                bookingId: data.bookingId,
                lat: data.lat,
                lng: data.lng,
              })
            }
          }
          io?.to('admins').emit('driver:location_update', {
            driverProfileId: dp.id,
            lat: data.lat,
            lng: data.lng,
          })
        }
      } catch (err) {
        console.error('Location update error:', err)
      }
    })

    socket.on('driver:online', async () => {
      await prisma.driverProfile.updateMany({ where: { userId }, data: { isOnline: true } })
    })

    socket.on('driver:offline', async () => {
      await prisma.driverProfile.updateMany({ where: { userId }, data: { isOnline: false } })
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

  console.log('🔌 Socket.IO realtime server ready')
  return io
}

export function emitToUser(userId: string, event: string, data: unknown) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data)
  }
}

export function emitToDrivers(event: string, data: unknown) {
  if (io) {
    io.to('drivers').emit(event, data)
  }
}

export function emitToAdmins(event: string, data: unknown) {
  if (io) {
    io.to('admins').emit(event, data)
  }
}

export function getIO() {
  return io
}
