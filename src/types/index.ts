// ── 席 ──────────────────────────────────────────
export interface Seat {
  id: string
  name: string
  solo: boolean        // 一人客フラグ
  defaultCast: string  // 席のデフォルト担当キャスト
  createdAt: number
}

// ── 注文アイテム ─────────────────────────────────
export interface OrderItem {
  id: string           // ユニークID（追加順で重複を避ける）
  name: string
  priceExTax: number   // 税抜価格
  qty: number
  cast: string         // 担当キャスト（空文字=未設定）
  category: string     // バック率の判定に使うカテゴリ（フリー入力は'フリー入力'）
  isToday: boolean     // 本日限定メニューフラグ
  isFree: boolean      // フリー入力フラグ
  fullBack: boolean    // 全額バック（この商品だけ100%バック）
}

// ── キャスト ─────────────────────────────────────
export interface Cast {
  id: string
  name: string
  sortOrder: number
}

// ── メニュー ─────────────────────────────────────
export interface MenuItem {
  id: string
  name: string
  priceExTax: number
  category: string
  isToday: boolean     // 本日限定メニュー
  sortOrder: number
}

// ── 支払い方法 ───────────────────────────────────
export type PayMethod = 'cash' | 'card' | 'qr'

// ── ユーザー権限 ─────────────────────────────────
export type Role = 'owner' | 'staff'

// ── 取引（会計完了済み） ─────────────────────────
export interface Transaction {
  id: string
  seatName: string
  solo: boolean
  items: OrderItem[]
  subtotal: number     // 税抜合計
  tax: number
  total: number        // 税込合計
  payMethod: PayMethod
  feeRate: number      // 決済手数料率（%）
  feeAmount: number    // 手数料額
  netAmount: number    // 実入金額
  primaryCast: string  // 売上が最も多いキャスト
  completedAt: number  // Unix timestamp
}

// ── 手数料設定 ───────────────────────────────────
export interface FeeSettings {
  card: number   // %
  qr: number     // %
}

// ── キャスト集計 ─────────────────────────────────
export interface CastSummary {
  name: string
  txCount: number
  salesAmount: number
  backAmount: number
}

// ── 売上サマリー ─────────────────────────────────
export interface SalesSummary {
  totalSales: number
  totalFee: number
  totalNet: number
  txCount: number
  avgPerCustomer: number
  soloCount: number
  byMethod: Record<PayMethod, { count: number; sales: number; fee: number; net: number }>
  castSummaries: CastSummary[]
  transactions: Transaction[]
}
