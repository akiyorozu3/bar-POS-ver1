// 純利益（P&L）の日別・月別集計。
// 純利益 = 実入金 − 人件費 − バック − 大入 − 固定費(日割り)   ※単発経費・日払いは引かない（表示のみ）
import type { Transaction, Payout, Expense, RecurringExpense, Cast, MenuItem, OiriTier } from '@/types'
import type { Shift } from '@/lib/punch'
import { durationMin } from '@/lib/punch'
import { wageOn, castLabel } from '@/lib/cast'
import { dateStrOf } from '@/store/posStore'
import { oiriConfigOn, oiriForDay } from '@/lib/oiri'
import { DRINK_BACK_CATEGORY, DRINK_BACK_CATEGORIES } from '@/lib/defaultMenus'

const DRINK = DRINK_BACK_CATEGORY

export interface ProfitRow {
  key: string        // 日別=YYYY-MM-DD / 月別=YYYY-MM
  sales: number      // 実入金（税込 − 決済手数料）
  labor: number      // 人件費（時給×勤務時間）
  back: number       // バック（卓＋ドリンク）
  oiri: number       // 大入
  dailyPay: number   // 日払い（純利益には引かない・表示用）
  expense: number    // 単発経費（符号込み。−が支出。純利益には含めない＝金庫で管理）
  fixedDay: number   // 固定費の日割り（符号込み。−が支出。純利益から差し引く）
  profit: number     // 純利益
}

// 指定年月(1-12)の暦日数
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()
// 指定年月に weekday(0-6) が何回あるか
function countWeekday(y: number, m: number, weekday: number): number {
  const D = daysInMonth(y, m)
  let c = 0
  for (let d = 1; d <= D; d++) if (new Date(y, m - 1, d).getDay() === weekday) c++
  return c
}
// 指定年月の固定費「月額合計」（符号込み）。毎週分はその月の該当回数で月換算。
function monthlyFixedTotal(recurring: RecurringExpense[], y: number, m: number): number {
  let total = 0
  for (const r of recurring) {
    if (r.cycle === 'monthly') total += r.amount
    else total += r.amount * countWeekday(y, m, r.day)   // 毎週 → その月の回数で月換算
  }
  return total
}

interface Params {
  transactions: Transaction[]
  payouts: Payout[]
  expenses: Expense[]
  recurringExpenses: RecurringExpense[]
  shifts: Shift[]
  casts: Cast[]
  menus: MenuItem[]
  backRate: number
  drinkBackRate: number
  oiriTiers: OiriTier[]   // 大入の設定（適用日付き）
  fromStr: string    // 期間開始（YYYY-MM-DD）
  toStr: string      // 期間終了（YYYY-MM-DD）
}

const emptyAgg = () => ({ sales: 0, labor: 0, back: 0, oiri: 0, dailyPay: 0, expense: 0, fixedDay: 0 })
type Agg = ReturnType<typeof emptyAgg>

// 1取引のバック額（卓バック＋ドリンクバック）。useSalesSummary と完全に同じ考え方。
// noBackNames（バック集計しないキャスト）は卓バック・ドリンクバックとも0扱い（集計と一致させる）。
function txBack(t: Transaction, backRate: number, drinkRate: number, menuBack: Map<string, number>, noBackNames: Set<string>): number {
  const tableCasts = (t.tableCasts ?? []).filter(Boolean)
  let back = 0
  // 卓バックは「会計時に焼き付けた最低会計額」以上のときだけ。担当で頭割りし、バックなしの人の分は除外。
  if (tableCasts.length > 0 && t.total >= (t.backThreshold ?? 0)) {
    const share = (t.total * backRate) / tableCasts.length
    for (const c of tableCasts) if (!noBackNames.has(c)) back += share
  }
  for (const it of t.items) {
    if (!DRINK_BACK_CATEGORIES.includes(it.category) || !it.cast || noBackNames.has(it.cast)) continue
    const amt = it.priceExTax * it.qty
    back += it.drinkBack != null ? it.drinkBack * it.qty
      : menuBack.has(it.name) ? (menuBack.get(it.name) as number) * it.qty
      : amt * drinkRate
  }
  return back
}

export function computeProfit(p: Params): { days: ProfitRow[]; months: ProfitRow[]; total: ProfitRow } {
  const menuBack = new Map<string, number>()
  for (const m of p.menus) if (m.category === DRINK && m.drinkBack != null) menuBack.set(m.name, m.drinkBack)
  const castById = new Map(p.casts.map((c) => [c.id, c]))
  // バック集計しないキャスト（名前判定・改名前の別名も含む）。純利益のバックからも除外して集計と一致させる。
  const noBackNames = new Set(p.casts.filter((c) => c.noBack).flatMap((c) => [castLabel(c), ...(c.aliases ?? [])]))

  const byDay = new Map<string, Agg>()
  const day = (k: string) => { let a = byDay.get(k); if (!a) { a = emptyAgg(); byDay.set(k, a) } return a }

  // 実入金・バック（取引の営業日で集計）。大入計算のため営業日ごとの取引も控えておく。
  const txByDay = new Map<string, Transaction[]>()
  for (const t of p.transactions) {
    const k = dateStrOf(t.completedAt)
    const a = day(k)
    a.sales += t.netAmount
    a.back += txBack(t, p.backRate, p.drinkBackRate, menuBack, noBackNames)
    const arr = txByDay.get(k) ?? []; arr.push(t); txByDay.set(k, arr)
  }
  // 大入：営業日ごとに自動計算（その日に有効な設定を使う）。設定が無い過去日のみ、
  // 旧仕様の手動大入(payout)で補う＝過去へ遡及しない。
  for (const [k, txs] of txByDay) {
    const cfg = oiriConfigOn(p.oiriTiers, k)
    if (cfg) day(k).oiri += oiriForDay(txs, cfg).total
  }
  // 日払い（手動）。大入(payout)は設定の無い過去日だけ採用（上の自動計算と二重計上しない）。
  for (const po of p.payouts) {
    const a = day(po.date)
    if (po.type === 'oiri') { if (!oiriConfigOn(p.oiriTiers, po.date)) a.oiri += po.amount }
    else a.dailyPay += po.amount
  }
  // 経費（単発）
  for (const e of p.expenses) day(e.date).expense += e.amount
  // 人件費（退勤済みシフトのみ）
  for (const s of p.shifts) {
    const min = durationMin(s.inAt, s.outAt)
    if (min == null) continue
    const c = castById.get(s.castId)
    day(s.date).labor += (c ? wageOn(c, s.date) : 0) * (min / 60)   // シフト日付の時給（変更履歴対応）
  }
  // 固定費（日割り）：各暦日に「その月の固定費月額合計 ÷ その月の日数」を計上し、純利益から差し引く。
  // 期間内の全暦日に載せる（売上の無い日も固定費は発生するため、月合計が正しくなる）。
  const end = new Date(`${p.toStr}T12:00:00`)
  const monthlyCache = new Map<string, { perDay: number }>()
  for (const d = new Date(`${p.fromStr}T12:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear(), mo = d.getMonth() + 1
    const k = `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const mk = `${y}-${String(mo).padStart(2, '0')}`
    let c = monthlyCache.get(mk)
    if (!c) { c = { perDay: monthlyFixedTotal(p.recurringExpenses, y, mo) / daysInMonth(y, mo) }; monthlyCache.set(mk, c) }
    day(k).fixedDay += c.perDay
  }

  const toRow = (key: string, a: Agg): ProfitRow => ({
    key,
    sales: Math.round(a.sales),
    labor: Math.round(a.labor),
    back: Math.round(a.back),
    oiri: Math.round(a.oiri),
    dailyPay: Math.round(a.dailyPay),
    expense: Math.round(a.expense),
    fixedDay: Math.round(a.fixedDay),
    // 純利益＝実入金−人件費−バック−大入−固定費(日割り)。単発経費は含めない（金庫で現金管理）
    profit: Math.round(a.sales - a.labor - a.back - a.oiri + a.fixedDay),
  })

  // 日別（何かしら値のある日だけ、新しい順）。経費だけの日は純利益に出さない（金庫で見る）
  const days = [...byDay.entries()]
    .map(([k, a]) => toRow(k, a))
    .filter((r) => r.sales || r.labor || r.back || r.oiri || r.dailyPay)
    .sort((x, y) => y.key.localeCompare(x.key))

  // 月別（日別を YYYY-MM で合算）
  const byMonth = new Map<string, Agg>()
  for (const [k, a] of byDay) {
    const mk = k.slice(0, 7)
    let m = byMonth.get(mk); if (!m) { m = emptyAgg(); byMonth.set(mk, m) }
    m.sales += a.sales; m.labor += a.labor; m.back += a.back; m.oiri += a.oiri; m.dailyPay += a.dailyPay; m.expense += a.expense; m.fixedDay += a.fixedDay
  }
  const months = [...byMonth.entries()].map(([k, a]) => toRow(k, a)).sort((x, y) => y.key.localeCompare(x.key))

  // 期間合計
  const totalAgg = emptyAgg()
  for (const a of byDay.values()) { totalAgg.sales += a.sales; totalAgg.labor += a.labor; totalAgg.back += a.back; totalAgg.oiri += a.oiri; totalAgg.dailyPay += a.dailyPay; totalAgg.expense += a.expense; totalAgg.fixedDay += a.fixedDay }

  return { days, months, total: toRow('合計', totalAgg) }
}
