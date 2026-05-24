import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload } from '../middleware/auth'
import { notificationService } from '../services/notification.service'
import { success, error, parsePagination } from '../utils/response'

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: authenticate,
    schema: { tags: ['Notifications'], description: 'Get my notifications', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const result = await notificationService.getNotifications(user.sub, page, limit)
    return reply.send(success(result))
  })

  app.patch('/:id/read', {
    preHandler: authenticate,
    schema: { tags: ['Notifications'], description: 'Mark notification as read', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    await notificationService.markRead(id, user.sub)
    return reply.send(success(null, 'Marked as read'))
  })

  app.patch('/read-all', {
    preHandler: authenticate,
    schema: { tags: ['Notifications'], description: 'Mark all notifications read', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    await notificationService.markAllRead(user.sub)
    return reply.send(success(null, 'All marked as read'))
  })
}
