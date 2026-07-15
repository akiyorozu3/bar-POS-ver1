// 純利益パネル専用のデータ取得。月別比較のため、期間トグルとは独立に
// 「直近 monthsBack ヶ月」を一度だけ取得する（履歴は頻繁に変わらないのでリスナー不要）。
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db, COLLECTIONS } from '@/lib/firebase'
import { dateStrOf, businessDayEnd, todayStr } from '@/store/posStore'
import type { Transaction, Payout, Expense, RecurringExpense, Punch } from '@/types'

export interface ProfitData {
  transactions: Transaction[]
  payouts: Payout[]
  expenses: Expense[]
  recurringExpenses: RecurringExpense[]
  punches: Punch[]
  fromStr: string
  toStr: string
  loading: boolean
}

const EMPTY: ProfitData = { transactions: [], payouts: [], expenses: [], recurringExpenses: [], punches: [], fromStr: '', toStr: '', loading: false }

export function useProfitData(monthsBack: number, active: boolean): ProfitData {
  const [data, setData] = useState<ProfitData>(EMPTY)

  useEffect(() => {
    if (!active) return
    let alive = true
    setData((d) => ({ ...d, loading: true }))

    // 直近 monthsBack ヶ月（今月含む）。営業日17:00始まり基準。
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1, 17, 0, 0)
    const to = businessDayEnd(todayStr())
    const fromMs = from.getTime()
    const toMs = to.getTime()
    const fromStr = dateStrOf(fromMs)
    const toStr = dateStrOf(toMs)

    const load = async () => {
      try {
        const [txSnap, poSnap, exSnap, recSnap, puSnap] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.TRANSACTIONS), where('completedAt', '>=', fromMs), where('completedAt', '<=', toMs), orderBy('completedAt', 'desc'))),
          getDocs(query(collection(db, COLLECTIONS.PAYOUTS), where('date', '>=', fromStr), where('date', '<=', toStr))),
          getDocs(query(collection(db, COLLECTIONS.EXPENSES), where('date', '>=', fromStr), where('date', '<=', toStr))),
          getDocs(collection(db, COLLECTIONS.RECURRING_EXPENSES)),
          getDocs(query(collection(db, COLLECTIONS.PUNCHES), where('at', '>=', fromMs), where('at', '<=', toMs))),
        ])
        if (!alive) return
        setData({
          transactions: txSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)),
          payouts: poSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Payout)),
          expenses: exSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)),
          recurringExpenses: recSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringExpense)),
          punches: puSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Punch)),
          fromStr, toStr, loading: false,
        })
      } catch {
        if (alive) setData((d) => ({ ...d, loading: false }))
      }
    }
    load()
    return () => { alive = false }
  }, [monthsBack, active])

  return data
}
