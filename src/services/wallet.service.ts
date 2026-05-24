import { prisma } from '../db/client'
import { WithdrawalStatus } from '@prisma/client'

export class WalletService {
  async getWallet(userId: string) {
    return prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
  }

  async credit(userId: string, amount: number, description: string, reference?: string, bookingId?: string) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } })
      if (!wallet) throw new Error('Wallet not found')
      const newBalance = wallet.balance + amount
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } })
      return tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount,
          balance: newBalance,
          description,
          reference,
          bookingId,
        },
      })
    })
  }

  async debit(userId: string, amount: number, description: string, reference?: string, bookingId?: string) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } })
      if (!wallet) throw new Error('Wallet not found')
      if (wallet.balance < amount) throw new Error('Insufficient wallet balance')
      const newBalance = wallet.balance - amount
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } })
      return tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount,
          balance: newBalance,
          description,
          reference,
          bookingId,
        },
      })
    })
  }

  async requestWithdrawal(
    userId: string,
    amount: number,
    method: string,
    accountNumber: string,
    accountName: string,
    provider?: string
  ) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } })
    if (!wallet) throw new Error('Wallet not found')
    if (wallet.balance < amount) throw new Error('Insufficient balance')
    if (amount < 1000) throw new Error('Minimum withdrawal is UGX 1,000')

    await this.debit(userId, amount, `Withdrawal request - ${method}`)

    return prisma.withdrawalRequest.create({
      data: {
        walletId: wallet.id,
        amount,
        method,
        accountNumber,
        accountName,
        provider,
        status: WithdrawalStatus.PENDING,
      },
    })
  }

  async processWithdrawal(
    withdrawalId: string,
    adminId: string,
    approve: boolean,
    rejectionReason?: string
  ) {
    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } })
    if (!withdrawal) throw new Error('Withdrawal not found')
    if (withdrawal.status !== WithdrawalStatus.PENDING) throw new Error('Already processed')

    if (approve) {
      return prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.APPROVED,
          processedBy: adminId,
          processedAt: new Date(),
        },
      })
    } else {
      const wallet = await prisma.wallet.findUnique({ where: { id: withdrawal.walletId } })
      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: withdrawal.amount } },
        })
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'CREDIT',
            amount: withdrawal.amount,
            balance: wallet.balance + withdrawal.amount,
            description: `Withdrawal reversal - ${rejectionReason || 'Rejected'}`,
          },
        })
      }

      return prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.REJECTED,
          processedBy: adminId,
          processedAt: new Date(),
          rejectionReason,
        },
      })
    }
  }

  async getTransactions(userId: string, page: number, limit: number) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } })
    if (!wallet) throw new Error('Wallet not found')
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ])
    return { data, total, balance: wallet.balance }
  }
}

export const walletService = new WalletService()
