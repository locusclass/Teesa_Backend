import { prisma } from '../db/client'
import { NotificationType, Prisma } from '@prisma/client'
import { emitToUser } from '../realtime/socketServer'

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
}

export class NotificationService {
  async createNotification(input: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue | undefined,
      },
    })

    emitToUser(input.userId, 'notification', notification)

    return notification
  }

  async getNotifications(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit
    const [data, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ])
    return { data, total, unreadCount }
  }

  async markRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    })
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
  }
}

export const notificationService = new NotificationService()
