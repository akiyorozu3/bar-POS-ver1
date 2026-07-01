import type { Punch } from '@/types'
import { dateStrOf } from '@/store/posStore'

export interface Shift {
  castId: string
  name: string
  realName?: string
  inAt: number
  outAt: number | null   // null = 未退勤
  inId: string           // 出勤打刻のID
  outId: string | null   // 退勤打刻のID（未退勤は null）
  date: string           // 出勤日（YYYY-MM-DD）
}

/** 打刻イベントをキャストごとに時系列で出勤→退勤ペアにする（日またぎOK） */
export function buildShifts(punches: Punch[]): { shifts: Shift[]; strayOuts: Punch[] } {
  const byCast = new Map<string, Punch[]>()
  for (const p of punches) {
    const arr = byCast.get(p.castId)
    if (arr) arr.push(p)
    else byCast.set(p.castId, [p])
  }
  const shifts: Shift[] = []
  const strayOuts: Punch[] = []
  for (const list of byCast.values()) {
    const sorted = [...list].sort((a, b) => a.at - b.at)
    let openIn: Punch | null = null
    const pushShift = (i: Punch, o: Punch | null) =>
      shifts.push({ castId: i.castId, name: i.name, realName: i.realName, inAt: i.at, outAt: o ? o.at : null, inId: i.id, outId: o ? o.id : null, date: dateStrOf(i.at) })
    for (const p of sorted) {
      if (p.type === 'in') {
        if (openIn) pushShift(openIn, null) // 前の出勤が退勤なし → 未退勤シフト
        openIn = p
      } else {
        if (openIn) { pushShift(openIn, p); openIn = null }
        else strayOuts.push(p) // 出勤なしの退勤
      }
    }
    if (openIn) pushShift(openIn, null)
  }
  shifts.sort((a, b) => a.inAt - b.inAt)
  return { shifts, strayOuts }
}

export const hhmm = (at: number) =>
  new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

/** 勤務時間の分 */
export const durationMin = (inAt: number, outAt: number | null): number | null =>
  outAt == null ? null : Math.max(0, Math.round((outAt - inAt) / 60000))

/** 勤務時間ラベル（例 5時間30分） */
export const durationLabel = (inAt: number, outAt: number | null): string => {
  const m = durationMin(inAt, outAt)
  if (m == null) return '勤務中'
  return `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分`
}

/** at(ms) → datetime-local の value（ローカル） */
export const toDatetimeLocal = (at: number): string => {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** datetime-local の value → at(ms)。不正なら NaN */
export const fromDatetimeLocal = (v: string): number => new Date(v).getTime()
