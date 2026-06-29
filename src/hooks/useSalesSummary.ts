import { useMemo } from 'react'
import type { Transaction, SalesSummary, PayMethod } from '@/types'
import { BACK_RATE } from '@/store/posStore'

const PAY_METHODS: PayMethod[] = ['cash', 'card', 'qr']

/**
 * 取引一覧から売上サマリーを計算するフック。
 * Firestore からの transactions をそのまま渡せば OK。
 */
export function useSalesSummary(transactions: Transaction[]): SalesSummary {
  return useMemo(() => {
    const byMethod = Object.fromEntries(
      PAY_METHODS.map((m) => [m, { count: 0, sales: 0, fee: 0, net: 0 }])
    ) as SalesSummary['byMethod']

    const castMap: Record<string, { txCount: number; salesAmount: number }> = {}

    let totalSales = 0
    let totalFee = 0
    let soloCount = 0

    for (const t of transactions) {
      totalSales += t.total
      totalFee += t.feeAmount
      if (t.solo) soloCount++

      const m = byMethod[t.payMethod]
      m.count++
      m.sales += t.total
      m.fee += t.feeAmount
      m.net += t.netAmount

      if (t.primaryCast) {
        if (!castMap[t.primaryCast]) {
          castMap[t.primaryCast] = { txCount: 0, salesAmount: 0 }
        }
        castMap[t.primaryCast].txCount++
        castMap[t.primaryCast].salesAmount += t.total
      }
    }

    const totalNet = totalSales - totalFee
    const txCount = transactions.length
    const avgPerCustomer = txCount > 0 ? Math.round(totalSales / txCount) : 0

    const castSummaries = Object.entries(castMap)
      .map(([name, v]) => ({
        name,
        txCount: v.txCount,
        salesAmount: v.salesAmount,
        backAmount: Math.round(v.salesAmount * BACK_RATE),
      }))
      .sort((a, b) => b.salesAmount - a.salesAmount)

    return {
      totalSales,
      totalFee,
      totalNet,
      txCount,
      avgPerCustomer,
      soloCount,
      byMethod,
      castSummaries,
      transactions,
    }
  }, [transactions])
}
