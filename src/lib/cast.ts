import type { Cast } from '@/types'

/** 店内表示名：ニックネーム優先、無ければ本名 */
export const castLabel = (c: Pick<Cast, 'name' | 'realName'>): string =>
  (c.name || c.realName || '').trim()

/** 給与・CSV用の名前：本名優先、無ければニックネーム */
export const castRealName = (c: Pick<Cast, 'name' | 'realName'>): string =>
  (c.realName || c.name || '').trim()

/**
 * 指定日に適用される時給。
 * wageHistory があれば「from <= date」で最も新しい適用開始日の時給を使う（過去は旧時給のまま）。
 * 履歴が無い/日付が最古の適用日より前なら hourlyWage にフォールバック。
 */
export const wageOn = (c: Pick<Cast, 'hourlyWage' | 'wageHistory'>, date: string): number => {
  const hist = c.wageHistory
  if (hist && hist.length) {
    let best: { from: string; wage: number } | null = null
    for (const h of hist) if (h.from <= date && (!best || h.from > best.from)) best = h
    if (best) return best.wage
    const earliest = [...hist].sort((a, b) => a.from.localeCompare(b.from))[0]
    return c.hourlyWage ?? earliest.wage
  }
  return c.hourlyWage ?? 0
}
