// 純利益（P&L）の日別・月別集計。
// 純利益 = 実入金 − 人件費 − バック − 大入 ＋ 経費(符号込み)   ※日払いは引かない（表示のみ）
import type { Transaction, Payout, Expense, RecurringExpense, Cast, MenuItem } from '@/types'
import type { Shift } from '@/lib/punch'
import { durationMin } from '@/lib/punch'
import { dateStrOf } from '@/store/posStore'
import { DRINK_BACK_CATEGORY, DRINK_BACK_CATEGORIES } from '@/lib/defaultMenus'

const DRINK = DRINK_BACK_CATEGORY

export interface ProfitRow {
  key: string        // 日別=YYYY-MM-DD / 月別=YYYY-MM
  sales: number      // 実入金（税込 − 決済手数料）
  labor: number      // 人件費（時給×勤務時間）
  back: number       // バック（卓＋ドリンク）
  oiri: number       // 大入
  dailyPay: number   // 日払い（純利益には引かない・表示用）
  expense: number    // 経費（符号込み。−が支出）
  profit: number     // 純利益
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
  fromStr: string    // 期間開始（YYYY-MM-DD）
  toStr: string      // 期間終了（YYYY-MM-DD）
}

const emptyAgg = () => ({ sales: 0, labor: 0, back: 0, oiri: 0, dailyPay: 0, expense: 0 })
type Agg = ReturnType<typeof emptyAgg>

// 1取引のバック額（卓バック＋ドリンクバック）。useSalesSummary と同じ考え方。
function txBack(t: Transaction, backRate: number, drinkRate: number, menuBack: Map<string, number>): number {
  const tableCasts = (t.tableCasts ?? []).filter(Boolean)
  // 卓バックは「会計時に焼き付けた最低会計額」以上のときだけ（過去取引は0=条件なし）
  let back = (tableCasts.length > 0 && t.total >= (t.backThreshold ?? 0)) ? t.total * backRate : 0
  for (const it of t.items) {
    if (!DRINK_BACK_CATEGORIES.includes(it.category) || !it.cast) continue
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
  const wageOf = new Map<string, number>()
  for (const c of p.casts) wageOf.set(c.id, c.hourlyWage ?? 0)

  const byDay = new Map<string, Agg>()
  const day = (k: string) => { let a = byDay.get(k); if (!a) { a = emptyAgg(); byDay.set(k, a) } return a }

  // 実入金・バック（取引の営業日で集計）
  for (const t of p.transactions) {
    const k = dateStrOf(t.completedAt)
    const a = day(k)
    a.sales += t.netAmount
    a.back += txBack(t, p.backRate, p.drinkBackRate, menuBack)
  }
  // 大入・日払い
  for (const po of p.payouts) {
    const a = day(po.date)
    if (po.type === 'oiri') a.oiri += po.amount
    else a.dailyPay += po.amount
  }
  // 経費（単発）
  for (const e of p.expenses) day(e.date).expense += e.amount
  // 人件費（退勤済みシフトのみ）
  for (const s of p.shifts) {
    const min = durationMin(s.inAt, s.outAt)
    if (min == null) continue
    day(s.date).labor += (wageOf.get(s.castId) ?? 0) * (min / 60)
  }
  // 固定費（期間内の該当日に計上）
  const end = new Date(`${p.toStr}T12:00:00`)
  for (const d = new Date(`${p.fromStr}T12:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (const r of p.recurringExpenses) {
      const hit = r.cycle === 'monthly' ? d.getDate() === r.day : d.getDay() === r.day
      if (hit) day(k).expense += r.amount
    }
  }

  const toRow = (key: string, a: Agg): ProfitRow => ({
    key,
    sales: Math.round(a.sales),
    labor: Math.round(a.labor),
    back: Math.round(a.back),
    oiri: Math.round(a.oiri),
    dailyPay: Math.round(a.dailyPay),
    expense: Math.round(a.expense),
    profit: Math.round(a.sales - a.labor - a.back - a.oiri + a.expense),
  })

  // 日別（何かしら値のある日だけ、新しい順）
  const days = [...byDay.entries()]
    .map(([k, a]) => toRow(k, a))
    .filter((r) => r.sales || r.labor || r.back || r.oiri || r.dailyPay || r.expense)
    .sort((x, y) => y.key.localeCompare(x.key))

  // 月別（日別を YYYY-MM で合算）
  const byMonth = new Map<string, Agg>()
  for (const [k, a] of byDay) {
    const mk = k.slice(0, 7)
    let m = byMonth.get(mk); if (!m) { m = emptyAgg(); byMonth.set(mk, m) }
    m.sales += a.sales; m.labor += a.labor; m.back += a.back; m.oiri += a.oiri; m.dailyPay += a.dailyPay; m.expense += a.expense
  }
  const months = [...byMonth.entries()].map(([k, a]) => toRow(k, a)).sort((x, y) => y.key.localeCompare(x.key))

  // 期間合計
  const totalAgg = emptyAgg()
  for (const a of byDay.values()) { totalAgg.sales += a.sales; totalAgg.labor += a.labor; totalAgg.back += a.back; totalAgg.oiri += a.oiri; totalAgg.dailyPay += a.dailyPay; totalAgg.expense += a.expense }

  return { days, months, total: toRow('合計', totalAgg) }
}
