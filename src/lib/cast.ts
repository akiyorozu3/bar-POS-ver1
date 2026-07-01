import type { Cast } from '@/types'

/** 店内表示名：ニックネーム優先、無ければ本名 */
export const castLabel = (c: Pick<Cast, 'name' | 'realName'>): string =>
  (c.name || c.realName || '').trim()

/** 給与・CSV用の名前：本名優先、無ければニックネーム */
export const castRealName = (c: Pick<Cast, 'name' | 'realName'>): string =>
  (c.realName || c.name || '').trim()
