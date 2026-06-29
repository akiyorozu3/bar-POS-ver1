export const TAX_RATE = 0.10

/** 税抜 → 税込（端数切り捨て） */
export const toTaxInc = (priceExTax: number): number =>
  Math.floor(priceExTax * (1 + TAX_RATE))

/** 税抜合計から消費税額を計算（端数切り捨て） */
export const calcTax = (subtotalExTax: number): number =>
  Math.floor(subtotalExTax * TAX_RATE)

/** 決済手数料額を計算（端数切り捨て） */
export const calcFee = (total: number, feeRatePct: number): number =>
  Math.floor(total * (feeRatePct / 100))
