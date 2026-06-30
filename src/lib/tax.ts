import type { TaxMode } from '@/types'

/** 消費税率の既定値（オーナーが設定で変更可） */
export const DEFAULT_TAX_RATE = 0.10

/**
 * メニューの1商品の表示価格。
 * - inclusive（税込で登録）: 登録額がそのまま表示価格
 * - exclusive（税抜で登録）: 税率を上乗せした税込価格（端数切り捨て）
 */
export const displayUnit = (price: number, rate: number, mode: TaxMode): number =>
  mode === 'inclusive' ? price : Math.floor(price * (1 + rate))

/**
 * 注文合計の計算。base は「登録価格 × 数量」の合計。
 * - inclusive: 登録額の合計がそのまま合計（消費税は加算しない・0）
 * - exclusive: 小計に税率を上乗せ（端数切り捨て）
 */
export const calcBill = (
  base: number,
  rate: number,
  mode: TaxMode
): { subtotal: number; tax: number; total: number } => {
  if (mode === 'inclusive') return { subtotal: base, tax: 0, total: base }
  const tax = Math.floor(base * rate)
  return { subtotal: base, tax, total: base + tax }
}

/** 決済手数料額を計算（feeRatePct は%、端数切り捨て） */
export const calcFee = (total: number, feeRatePct: number): number =>
  Math.floor(total * (feeRatePct / 100))
