import { useMemo } from 'react'
import type { Transaction, SalesSummary, PayMethod } from '@/types'
import { usePosStore } from '@/store/posStore'

const PAY_METHODS: PayMethod[] = ['cash', 'card', 'qr']

/**
 * 取引一覧から売上サマリーを計算するフック。
 * Firestore からの transactions をそのまま渡せば OK。
 */
export function useSalesSummary(transactions: Transaction[]): SalesSummary {
  const backRate = usePosStore((s) => s.backRate)
  const categoryRates = usePosStore((s) => s.categoryRates)
  return useMemo(() => {
    const byMethod = Object.fromEntries(
      PAY_METHODS.map((m) => [m, { count: 0, sales: 0, fee: 0, net: 0 }])
    ) as SalesSummary['byMethod']

    // キャスト別の集計。salesAmount は税抜売上、backRaw は丸め前のバック額。
    const castMap: Record<string, { txCount: number; salesAmount: number; backRaw: number }> = {}
    const UNASSIGNED = '未設定'

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

      // 品目ごとの担当キャストで税抜売上を按分し、バック率も品目ごとに適用する
      const castsInTx = new Set<string>()
      for (const item of t.items) {
        const cast = item.cast || UNASSIGNED
        if (!castMap[cast]) castMap[cast] = { txCount: 0, salesAmount: 0, backRaw: 0 }
        const itemSales = item.priceExTax * item.qty
        // 全額バック → 100% / カテゴリ別バック率があればそれ / なければ基本バック率
        const rate = item.fullBack ? 1 : (categoryRates[item.category] ?? backRate)
        castMap[cast].salesAmount += itemSales
        castMap[cast].backRaw += itemSales * rate
        castsInTx.add(cast)
      }
      // 1取引につき、関与した各キャストの担当件数を1ずつ加算
      for (const cast of castsInTx) castMap[cast].txCount++
    }

    const totalNet = totalSales - totalFee
    const txCount = transactions.length
    const avgPerCustomer = txCount > 0 ? Math.round(totalSales / txCount) : 0

    const castSummaries = Object.entries(castMap)
      .map(([name, v]) => ({
        name,
        txCount: v.txCount,
        salesAmount: v.salesAmount,
        // 担当未設定の売上はバック対象外（誰にも支払わない）
        backAmount: name === UNASSIGNED ? 0 : Math.round(v.backRaw),
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
  }, [transactions, backRate, categoryRates])
}
