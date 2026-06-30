import type { MenuItem } from '@/types'

/** 初回起動時にFirestoreへ投入するデフォルトメニュー */
export const DEFAULT_MENUS: Omit<MenuItem, 'id'>[] = [
  // ウイスキー
  { name: '山崎 12年',      priceExTax: 1091, category: 'ウイスキー', isToday: false, sortOrder: 10 },
  { name: '白州 12年',      priceExTax: 1182, category: 'ウイスキー', isToday: false, sortOrder: 11 },
  { name: '響 JAPANESE',   priceExTax: 1364, category: 'ウイスキー', isToday: false, sortOrder: 12 },
  { name: 'グレンリベット', priceExTax:  818, category: 'ウイスキー', isToday: false, sortOrder: 13 },
  { name: 'ラフロイグ',     priceExTax: 1000, category: 'ウイスキー', isToday: false, sortOrder: 14 },
  { name: 'ボウモア',       priceExTax:  909, category: 'ウイスキー', isToday: false, sortOrder: 15 },
  { name: 'J.D.オールド',  priceExTax:  636, category: 'ウイスキー', isToday: false, sortOrder: 16 },
  { name: 'メーカーズ',     priceExTax:  727, category: 'ウイスキー', isToday: false, sortOrder: 17 },
  { name: 'タリスカー',     priceExTax:  955, category: 'ウイスキー', isToday: false, sortOrder: 18 },
  // カクテル
  { name: 'ハイボール',       priceExTax: 545, category: 'カクテル', isToday: false, sortOrder: 20 },
  { name: 'モスコミュール',   priceExTax: 636, category: 'カクテル', isToday: false, sortOrder: 21 },
  { name: 'ジントニック',     priceExTax: 636, category: 'カクテル', isToday: false, sortOrder: 22 },
  { name: 'マンハッタン',     priceExTax: 818, category: 'カクテル', isToday: false, sortOrder: 23 },
  { name: 'ネグローニ',       priceExTax: 864, category: 'カクテル', isToday: false, sortOrder: 24 },
  { name: 'O.F.',             priceExTax: 909, category: 'カクテル', isToday: false, sortOrder: 25 },
  // ビール
  { name: '生ビール',     priceExTax: 545, category: 'ビール', isToday: false, sortOrder: 30 },
  { name: 'クラフト IPA', priceExTax: 727, category: 'ビール', isToday: false, sortOrder: 31 },
  { name: '黒ビール',     priceExTax: 636, category: 'ビール', isToday: false, sortOrder: 32 },
  // フード
  { name: 'チーズ盛り合わせ', priceExTax:  818, category: 'フード', isToday: false, sortOrder: 40 },
  { name: 'ナッツ盛り',       priceExTax:  455, category: 'フード', isToday: false, sortOrder: 41 },
  { name: 'サーモンマリネ',   priceExTax: 1000, category: 'フード', isToday: false, sortOrder: 42 },
  { name: '生ハム',           priceExTax:  909, category: 'フード', isToday: false, sortOrder: 43 },
]

export const MENU_CATEGORIES = ['セット', 'ショット', 'シャンパン', 'キャストドリンク', 'ウイスキー', 'カクテル', 'ビール', 'フード'] as const
export type MenuCategory = typeof MENU_CATEGORIES[number]

/** よく使うフリー入力プリセット */
export const FREE_PRESETS = [
  { name: 'ボトルチャージ',    priceExTax: 2000 },
  { name: '指名料',            priceExTax: 1000 },
  { name: '延長料',            priceExTax: 1500 },
  { name: 'テーブルチャージ',  priceExTax:  500 },
  { name: 'サービス料',        priceExTax:  800 },
] as const
