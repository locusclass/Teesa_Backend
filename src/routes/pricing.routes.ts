import { FastifyInstance } from 'fastify'
import { prisma } from '../db/client'
import { success, error } from '../utils/response'
import { requireAdmin } from '../middleware/auth'

export async function pricingRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: { tags: ['Pricing'], description: 'List all pricing rules' },
  }, async (_req, reply) => {
    const rules = await prisma.pricingRule.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: { category: { sortOrder: 'asc' } },
    })
    return reply.send(success(rules))
  })

  app.get('/category/:categoryId', {
    schema: { tags: ['Pricing'], description: 'Get pricing for a category' },
  }, async (req, reply) => {
    const { categoryId } = req.params as { categoryId: string }
    const rule = await prisma.pricingRule.findFirst({
      where: { categoryId, isActive: true },
      include: { category: true },
    })
    if (!rule) return reply.code(404).send(error('Pricing rule not found'))
    return reply.send(success(rule))
  })

  app.post('/estimate', {
    schema: { tags: ['Pricing'], description: 'Estimate fare for a trip' },
  }, async (req, reply) => {
    try {
      const { categoryId, distanceKm, durationMinutes } = req.body as {
        categoryId: string; distanceKm: number; durationMinutes: number
      }
      const rule = await prisma.pricingRule.findFirst({ where: { categoryId, isActive: true } })
      if (!rule) return reply.code(404).send(error('Pricing not found'))
      let fare = rule.baseFare + distanceKm * rule.perKmRate + durationMinutes * rule.perMinuteRate
      fare = Math.max(fare, rule.minimumFare)
      if (rule.vipMultiplier) fare *= rule.vipMultiplier
      fare = Math.round(fare)
      return reply.send(success({ estimatedFare: fare, currency: rule.currency, breakdown: {
        base: rule.baseFare, distance: Math.round(distanceKm * rule.perKmRate),
        time: Math.round(durationMinutes * rule.perMinuteRate), multiplier: rule.vipMultiplier || 1,
      }}))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.post('/', {
    preHandler: requireAdmin(),
    schema: { tags: ['Pricing'], description: 'Create pricing rule (admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const body = req.body as Record<string, unknown>
      const rule = await prisma.pricingRule.create({ data: body as Parameters<typeof prisma.pricingRule.create>[0]['data'] })
      return reply.code(201).send(success(rule))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.patch('/:id', {
    preHandler: requireAdmin(),
    schema: { tags: ['Pricing'], description: 'Update pricing rule (admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const updated = await prisma.pricingRule.update({ where: { id }, data: body as Parameters<typeof prisma.pricingRule.update>[0]['data'] })
    return reply.send(success(updated))
  })
}
