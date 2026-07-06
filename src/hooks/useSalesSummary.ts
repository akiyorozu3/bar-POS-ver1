import { useMemo } from 'react'
import type { Transaction, SalesSummary, PayMethod } from '@/types'
import { usePosStore } from '@/store/posStore'

const PAY_METHODS: PayMethod[] = ['cash', 'card', 'qr']

/**
 * 取引一覧から売上サマリーを計算するフック。
 * Firestore からの transactions をそのまま渡せば OK。
 */
const DRINK_CATEGORY = 'キャストドリンク'

export function useSalesSummary(transactions: Transaction[]): SalesSummary {
  const backRate = usePosStore((s) => s.backRate)            // 卓バック率
  const drinkBackRate = usePosStore((s) => s.drinkBackRate)  // ドリンクバック率
  return useMemo(() => {
    const byMethod = Object.fromEntries(
      PAY_METHODS.map((m) => [m, { count: 0, sales: 0, fee: 0, net: 0 }])
    ) as SalesSummary['byMethod']

    // キャスト別の集計。salesAmount は担当した卓・ドリンクの売上、backRaw は丸め前のバック額。
    const castMap: Record<string, { txCount: number; salesAmount: number; backRaw: number }> = {}
    const UNASSIGNED = '未設定'
    const ensure = (c: string) => (castMap[c] ??= { txCount: 0, salesAmount: 0, backRaw: 0 })

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

      // ① 卓バック：合計 × 卓バック率 を、卓の担当キャストで頭割り
      const tableCasts = (t.tableCasts ?? []).filter(Boolean)
      if (tableCasts.length === 0) {
        // 担当未設定の卓はバック対象外（売上だけ計上）
        const u = ensure(UNASSIGNED)
        u.salesAmount += t.total
        u.txCount++
      } else {
        const shareSales = t.total / tableCasts.length
        const shareBack = (t.total * backRate) / tableCasts.length
        for (const c of tableCasts) {
          const e = ensure(c)
          e.salesAmount += shareSales
          e.backRaw += shareBack
          e.txCount++
        }
      }

      // ② ドリンクバック：その品目の担当へ上乗せ
      //   drinkBack（円/杯）が記録されていればそれ×杯数、無ければ旧仕様の 料金×ドリンクバック率
      for (const item of t.items) {
        if (item.category !== DRINK_CATEGORY) continue
        const c = item.cast || UNASSIGNED
        const amt = item.priceExTax * item.qty
        const e = ensure(c)
        if (c !== UNASSIGNED) {
          const back = item.drinkBack != null ? item.drinkBack * item.qty : amt * drinkBackRate
          e.backRaw += back
        }
        // ドリンク分の売上も可視化（卓担当の卓売上とは別計上）
        e.salesAmount += amt
      }
    }

    const totalNet = totalSales - totalFee
    const txCount = transactions.length
    const avgPerCustomer = txCount > 0 ? Math.round(totalSales / txCount) : 0

    const castSummaries = Object.entries(castMap)
      // 卓もドリンクも担当が未設定の分（UNASSIGNED）はキャストバック集計に出さない
      .filter(([name]) => name !== UNASSIGNED)
      .map(([name, v]) => ({
        name,
        txCount: v.txCount,
        salesAmount: Math.round(v.salesAmount),
        backAmount: Math.round(v.backRaw),
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
  }, [transactions, backRate, drinkBackRate])
}
