// 金庫（お金の残高）台帳のロジック。
// 「現金ベース」＝お金が実際に動いた日で残高を積む。売上管理（発生ベース）とは別物。
//
// 自動反映（既存データ由来）:
//   ＋ 現金売上（会計の現金分。分割の現金分も含む／営業日ごと）
//   ± 経費（単発＋固定費・符号込み）
//   − 日払い・大入
// 手動（CashEntry）:
//   ＋ カード/QR入金、± その他、− 給与・人件費 など
import type { Transaction, Expense, RecurringExpense, Payout, CashEntry } from '@/types'
import { dateStrOf } from '@/store/posStore'

export type MovementKind = 'cash-sales' | 'expense' | 'payout' | 'manual'

export interface Movement {
  date: string          // YYYY-MM-DD
  label: string
  kind: MovementKind
  amount: number        // 符号込み（＋入金 / −出金）
  auto: boolean         // true=自動（削除不可）/ false=手動
  entryId?: string      // 手動のとき、削除用のドキュメントID
}

interface BuildParams {
  openingDate: string
  today: string
  transactions: Transaction[]
  expenses: Expense[]
  recurringExpenses: RecurringExpense[]
  payouts: Payout[]
  cashEntries: CashEntry[]
}

// 1取引の現金分（分割は現金の内訳だけ、単一は現金会計のみ）
const cashOfTx = (t: Transaction): number =>
  t.payments && t.payments.length
    ? t.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0)
    : (t.payMethod === 'cash' ? t.total : 0)

const CATEGORY_LABEL: Record<string, string> = {
  card: 'カード入金', qr: 'QR入金', wage: '給与・人件費',
  'other-in': 'その他入金', 'other-out': 'その他出金',
}
export const cashCategoryLabel = (c: string): string => CATEGORY_LABEL[c] ?? c

// 期首日〜today の範囲で、全部の動きを日付順に並べて返す（残高の積み上げは呼び出し側）
export function buildMovements(p: BuildParams): Movement[] {
  const inRange = (d: string) => d >= p.openingDate && d <= p.today
  const out: Movement[] = []

  // ① 現金売上（営業日ごとに合算）
  const cashByDay = new Map<string, number>()
  for (const t of p.transactions) {
    const cash = cashOfTx(t)
    if (cash === 0) continue
    const d = dateStrOf(t.completedAt)
    if (!inRange(d)) continue
    cashByDay.set(d, (cashByDay.get(d) ?? 0) + cash)
  }
  for (const [d, sum] of cashByDay) out.push({ date: d, label: '現金売上', kind: 'cash-sales', amount: sum, auto: true })

  // ② 経費（単発・符号込み。−が支出）
  for (const e of p.expenses) {
    if (!inRange(e.date)) continue
    out.push({ date: e.date, label: e.item || '経費', kind: 'expense', amount: e.amount, auto: true })
  }

  // ③ 固定費（期間内の該当日に計上）
  const start = new Date(`${p.openingDate}T12:00:00`)
  const end = new Date(`${p.today}T12:00:00`)
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (const r of p.recurringExpenses) {
      const hit = r.cycle === 'monthly' ? d.getDate() === r.day : d.getDay() === r.day
      if (hit) out.push({ date: ds, label: `${r.item || '固定費'}（固定費）`, kind: 'expense', amount: r.amount, auto: true })
    }
  }

  // ④ 日払い・大入（出金）
  for (const po of p.payouts) {
    if (!inRange(po.date)) continue
    const tag = po.type === 'oiri' ? '大入' : '日払い'
    out.push({ date: po.date, label: `${tag}　${po.name}`, kind: 'payout', amount: -Math.abs(po.amount), auto: true })
  }

  // ⑤ 手動入出金（符号込み）
  for (const c of p.cashEntries) {
    if (!inRange(c.date)) continue
    const base = cashCategoryLabel(c.category)
    out.push({ date: c.date, label: c.memo ? `${base}　${c.memo}` : base, kind: 'manual', amount: c.amount, auto: false, entryId: c.id })
  }

  // 日付昇順 → 種別の並び（自動→手動、現金売上/経費/日払い順）で安定化
  const kindOrder: Record<MovementKind, number> = { 'cash-sales': 0, expense: 1, payout: 2, manual: 3 }
  out.sort((a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind] || a.label.localeCompare(b.label))
  return out
}

export interface LedgerRow extends Movement { balance: number }

// 期首残高から積み上げ、残高付きの行にする
export function withRunningBalance(movements: Movement[], openingBalance: number): LedgerRow[] {
  let bal = openingBalance
  return movements.map((m) => { bal += m.amount; return { ...m, balance: bal } })
}
