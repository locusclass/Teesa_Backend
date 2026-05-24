import { FastifyInstance } from 'fastify'
import { authenticate, JwtPayload, requireAdmin } from '../middleware/auth'
import { walletService } from '../services/wallet.service'
import { success, error, paginated, parsePagination } from '../utils/response'
import { prisma } from '../db/client'

export async function walletRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: authenticate,
    schema: { tags: ['Wallets'], description: 'Get my wallet', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const wallet = await walletService.getWallet(user.sub)
    if (!wallet) return reply.code(404).send(error('Wallet not found'))
    return reply.send(success(wallet))
  })

  app.get('/transactions', {
    preHandler: authenticate,
    schema: { tags: ['Wallets'], description: 'Get wallet transactions', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const query = req.query as Record<string, string>
    const { page, limit } = parsePagination(query)
    const result = await walletService.getTransactions(user.sub, page, limit)
    return reply.send({ ...paginated(result.data, result.total, page, limit), balance: result.balance })
  })

  app.post('/withdraw', {
    preHandler: authenticate,
    schema: { tags: ['Wallets'], description: 'Request withdrawal', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { amount, method, accountNumber, accountName, provider } = req.body as {
        amount: number; method: string; accountNumber: string; accountName: string; provider?: string
      }
      const request = await walletService.requestWithdrawal(user.sub, amount, method, accountNumber, accountName, provider)
      return reply.code(201).send(success(request))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })

  app.get('/withdrawals', {
    preHandler: authenticate,
    schema: { tags: ['Wallets'], description: 'Get withdrawal requests', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    const user = req.user as JwtPayload
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.sub } })
    if (!wallet) return reply.code(404).send(error('Wallet not found'))
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(success(withdrawals))
  })

  app.patch('/withdrawals/:id', {
    preHandler: requireAdmin(),
    schema: { tags: ['Wallets'], description: 'Process withdrawal (admin)', security: [{ Bearer: [] }] },
  }, async (req, reply) => {
    try {
      const user = req.user as JwtPayload
      const { id } = req.params as { id: string }
      const { approve, rejectionReason } = req.body as { approve: boolean; rejectionReason?: string }
      const result = await walletService.processWithdrawal(id, user.sub, approve, rejectionReason)
      return reply.send(success(result))
    } catch (err: unknown) {
      return reply.code(400).send(error((err as Error).message))
    }
  })
}
