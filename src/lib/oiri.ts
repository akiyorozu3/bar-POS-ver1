// 大入（おおいり）の計算。
// 1営業日の売上合計が閾値を超えたら「原資（2万/3万など）」を、その日に売上のあった
// キャストへ「売上シェア」で按分する。設定は適用日付きで、過去営業日には遡及しない。
import type { Transaction, OiriTier } from '@/types'
import { DRINK_BACK_CATEGORIES } from '@/lib/defaultMenus'

// 既定値（店が設定するまでのフォールバック用。from は実運用では保存時に today を入れる）
export const DEFAULT_OIRI_TIER: OiriTier = {
  from: '1970-01-01',
  tier1Threshold: 150000, tier1Amount: 20000,
  tier2Threshold: 250000, tier2Amount: 30000,
}

// ある営業日(dateStr)に有効な大入設定を返す。from <= dateStr の中で最も新しいもの。
// 該当なし（＝その日より後に初めて設定した）なら null＝大入なし（遡及しない）。
export function oiriConfigOn(tiers: OiriTier[], dateStr: string): OiriTier | null {
  let best: OiriTier | null = null
  for (const t of tiers) {
    if (t.from <= dateStr && (!best || t.from > best.from)) best = t
  }
  return best
}

// その日の売上合計に対する「大入の原資」。設定なし・閾値未満は0。
export function oiriPool(dayTotal: number, cfg: OiriTier | null): number {
  if (!cfg) return 0
  if (dayTotal >= cfg.tier2Threshold) return cfg.tier2Amount
  if (dayTotal >= cfg.tier1Threshold) return cfg.tier1Amount
  return 0
}

// 1営業日分の取引から、キャスト別の売上額を集計（担当未設定は対象外）。
// useSalesSummary の売上列と同じ考え方：卓は担当で頭割り、キャストドリンクは料金を担当へ。
export function perCastSales(txs: Transaction[]): Map<string, number> {
  const m = new Map<string, number>()
  const add = (name: string, amt: number) => m.set(name, (m.get(name) ?? 0) + amt)
  for (const t of txs) {
    const tableCasts = (t.tableCasts ?? []).filter(Boolean)
    if (tableCasts.length > 0) {
      const share = t.total / tableCasts.length
      for (const c of tableCasts) add(c, share)
    }
    for (const item of t.items) {
      if (!DRINK_BACK_CATEGORIES.includes(item.category) || !item.cast) continue
      add(item.cast, item.priceExTax * item.qty)
    }
  }
  return m
}

// 1営業日分の大入をキャスト別に算出する。
//   pool = 原資（0/2万/3万）。閾値判定は「その日の売上合計(dayTotal)」で行うが、
//   配分は「担当がついた売上の合計(base)」を分母にして満額を山分けする
//   （＝担当未設定の売上があっても原資が蒸発せず、合計は常に pool に一致する）。
//   端数は最大剰余法で配り、余り1円は売上シェアの大きいキャストへ寄せる。
// 返り値：キャスト別の大入(円) と その日の大入合計(= pool, 担当売上がある場合)。
export function oiriForDay(txs: Transaction[], cfg: OiriTier | null): { perCast: Map<string, number>; total: number } {
  const dayTotal = txs.reduce((a, t) => a + t.total, 0)
  const pool = oiriPool(dayTotal, cfg)
  const perCast = new Map<string, number>()
  if (pool <= 0) return { perCast, total: 0 }
  const sales = [...perCastSales(txs)].filter(([, s]) => s > 0)
  const base = sales.reduce((a, [, s]) => a + s, 0)
  if (base <= 0) return { perCast, total: 0 } // 担当がついた売上が無ければ配りようがない
  // 原資を担当売上シェアで配分（まず切り捨て→余りを frac の大きい順に+1円）。
  const rows = sales.map(([name, s]) => {
    const exact = (pool * s) / base
    const floor = Math.floor(exact)
    return { name, s, floor, frac: exact - floor }
  })
  let remainder = pool - rows.reduce((a, r) => a + r.floor, 0)
  rows.sort((a, b) => b.frac - a.frac || b.s - a.s || a.name.localeCompare(b.name))
  for (let i = 0; i < rows.length && remainder > 0; i++, remainder--) rows[i].floor += 1
  let total = 0
  for (const r of rows) if (r.floor !== 0) { perCast.set(r.name, r.floor); total += r.floor }
  return { perCast, total }
}

// 取引を営業日(YYYY-MM-DD)ごとにまとめる。
export function groupByBusinessDay(txs: Transaction[], dateStrOf: (ts: number) => string): Map<string, Transaction[]> {
  const byDay = new Map<string, Transaction[]>()
  for (const t of txs) {
    const k = dateStrOf(t.completedAt)
    const arr = byDay.get(k) ?? []
    arr.push(t)
    byDay.set(k, arr)
  }
  return byDay
}
