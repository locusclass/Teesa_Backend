import { FastifyInstance } from 'fastify'
import { prisma } from '../db/client'
import { success, error } from '../utils/response'
import { authenticate, requireAdmin } from '../middleware/auth'

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: { tags: ['Categories'], description: 'List all active transport categories' },
  }, async (_req, reply) => {
    const categories = await prisma.transportCategory.findMany({
      where: { isActive: true },
      include: { pricingRules: { where: { isActive: true }, take: 1 } },
      orderBy: { sortOrder: 'asc' },
    })
    return reply.send(success(categories))
  })

  app.get('/passenger', {
    schema: { tags: ['Categories'], description: 'List passenger transport categories' },
  }, async (_req, reply) => {
    const categories = await prisma.transportCategory.findMany({
      where: { isActive: true, type: 'PASSENGER' },
      include: { pricingRules: { where: { isActive: true }, take: 1 } },
      orderBy: { sortOrder: 'asc' },
    })
    return reply.send(success(categories))
  })

  app.get('/cargo', {
    schema: { tags: ['Categories'], description: 'List cargo transport categories' },
  }, async (_req, reply) => {
    const categories = await prisma.transportCategory.findMany({
      where: { isActive: true, type: 'CARGO' },
      include: { pricingRules: { where: { isActive: true }, take: 1 } },
      orderBy: { sortOrder: 'asc' },
    })
    return reply.send(success(categories))
  })

  app.get('/:slug', {
    schema: { tags: ['Categories'], description: 'Get category by slug' },
  }, async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const category = await prisma.transportCategory.findUnique({
      where: { slug },
      include: { pricingRules: { where: { isActive: true }, take: 1 } },
    })
    if (!category) return reply.code(404).send(error('Category not found'))
    return reply.send(success(category))
  })

  app.post('/', {
    preHandler: requireAdmin(),
    schema: { tags: ['Categories'], description: 'Create category (admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const body = req.body as {
        slug: string; name: string; type: 'PASSENGER' | 'CARGO';
        description?: string; sortOrder?: number
      }
      const category = await prisma.transportCategory.create({ data: body })
      return reply.code(201).send(success(category))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.patch('/:id', {
    preHandler: requireAdmin(),
    schema: { tags: ['Categories'], description: 'Update category (admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const updated = await prisma.transportCategory.update({ where: { id }, data: body })
    return reply.send(success(updated))
  })
}
