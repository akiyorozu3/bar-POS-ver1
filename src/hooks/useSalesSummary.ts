import { useMemo } from 'react'
import type { Transaction, SalesSummary, PayMethod } from '@/types'
import { usePosStore } from '@/store/posStore'
import { DRINK_BACK_CATEGORY, DRINK_BACK_CATEGORIES } from '@/lib/defaultMenus'

const PAY_METHODS: PayMethod[] = ['cash', 'card', 'qr']

/**
 * 取引一覧から売上サマリーを計算するフック。
 * Firestore からの transactions をそのまま渡せば OK。
 */
const DRINK_CATEGORY = DRINK_BACK_CATEGORY

export function useSalesSummary(transactions: Transaction[]): SalesSummary {
  const backRate = usePosStore((s) => s.backRate)            // 卓バック率
  const drinkBackRate = usePosStore((s) => s.drinkBackRate)  // ドリンクバック率
  const menus = usePosStore((s) => s.menus)                  // 保険用：現行メニューの円バック参照
  return useMemo(() => {
    // 保険：明細に円バックが焼き付いていない場合、現行メニューの円バックを商品名で引く。
    // （端末が古い等で焼き付け漏れが起きても、ドリンクバックが0円にならないようにする）
    const menuDrinkBack = new Map<string, number>()
    for (const m of menus) {
      if (m.category === DRINK_CATEGORY && m.drinkBack != null) menuDrinkBack.set(m.name, m.drinkBack)
    }
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

      // 支払い方法別の集計。分割支払いは内訳（payments）を各方法へ振り分ける。
      if (t.payments && t.payments.length) {
        for (const p of t.payments) {
          const m = byMethod[p.method]
          m.count++
          m.sales += p.amount
          m.fee += p.feeAmount
          m.net += p.amount - p.feeAmount
        }
      } else {
        const m = byMethod[t.payMethod]
        m.count++
        m.sales += t.total
        m.fee += t.feeAmount
        m.net += t.netAmount
      }

      // ① 卓バック：合計 × 卓バック率 を、卓の担当キャストで頭割り
      const tableCasts = (t.tableCasts ?? []).filter(Boolean)
      if (tableCasts.length === 0) {
        // 担当未設定の卓はバック対象外（売上だけ計上）
        const u = ensure(UNASSIGNED)
        u.salesAmount += t.total
        u.txCount++
      } else {
        // 卓バックは会計の税込合計が「会計時に焼き付けた最低会計額」以上のときだけ発生。
        // 過去取引には焼き付けが無い（=0）ので遡及しない。売上は条件に関わらず計上。
        const overThreshold = t.total >= (t.backThreshold ?? 0)
        const shareSales = t.total / tableCasts.length
        const shareBack = overThreshold ? (t.total * backRate) / tableCasts.length : 0
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
        // キャストドリンク＋特例バックドリンクを対象（後者は品目・値段・バックをその場入力／バックはマイナス可）
        if (!DRINK_BACK_CATEGORIES.includes(item.category)) continue
        const c = item.cast || UNASSIGNED
        const amt = item.priceExTax * item.qty
        const e = ensure(c)
        if (c !== UNASSIGNED) {
          // ① 焼き付け済みの円バック → その額（非遡及を維持）
          // ② 未焼き付け → 現行メニューの円バック（保険）
          // ③ それも無ければ → 旧仕様の率
          const back =
            item.drinkBack != null ? item.drinkBack * item.qty :
            menuDrinkBack.has(item.name) ? (menuDrinkBack.get(item.name) as number) * item.qty :
            amt * drinkBackRate
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
  }, [transactions, backRate, drinkBackRate, menus])
}
