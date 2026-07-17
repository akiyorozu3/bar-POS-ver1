// ── 席 ──────────────────────────────────────────
export interface Seat {
  id: string
  name: string
  solo: boolean          // 一人客フラグ
  tableCasts: string[]   // 卓の担当キャスト（複数可。卓バックを頭割り）
  createdAt: number
}

// ── 注文アイテム ─────────────────────────────────
export interface OrderItem {
  id: string           // ユニークID（追加順で重複を避ける）
  name: string
  priceExTax: number   // 税抜価格
  qty: number
  cast: string         // 担当キャスト（キャストドリンクのドリンクバック用。空文字=未設定）
  category: string     // カテゴリ（キャストドリンク判定等。フリー入力は'フリー入力'）
  isToday: boolean     // 本日限定メニューフラグ
  isFree: boolean      // フリー入力フラグ
  drinkBack?: number   // 記録時のドリンクバック額（円/杯）。キャストドリンクのみ。未設定なら旧ドリンクバック率(%)で計算
}

// ── キャスト ─────────────────────────────────────
export interface Cast {
  id: string
  name: string        // ニックネーム（源氏名。店内表示に使う）
  realName?: string   // 本名（給与・CSV用）
  hourlyWage?: number // 時給（円/時）。人件費＝時給×勤務時間。未設定は0扱い
  sortOrder: number
}

// ── 打刻 ─────────────────────────────────────────
export interface Punch {
  id: string
  castId: string
  name: string        // 打刻時のニックネーム
  realName?: string   // 打刻時の本名
  type: 'in' | 'out'  // 出勤 / 退勤
  at: number          // 打刻時刻（Unixミリ秒）
  date: string        // YYYY-MM-DD
  by?: string         // 打刻した権限（owner/staff）
}

// ── メニュー ─────────────────────────────────────
export interface MenuItem {
  id: string
  name: string
  priceExTax: number
  category: string
  isToday: boolean     // 本日限定メニュー
  sortOrder: number
  drinkBack?: number   // キャストドリンクの1杯あたりバック額（円）。未設定なら旧ドリンクバック率(%)を使う
}

// ── 支払い方法 ───────────────────────────────────
export type PayMethod = 'cash' | 'card' | 'qr'

// ── 分割支払いの内訳 ─────────────────────────────
// 1会計で複数の支払い方法を混在させる場合の内訳（例：現金＋カード）。
// 単一支払いのときは Transaction.payments を持たない。
export interface PaymentSplit {
  method: PayMethod
  amount: number     // この方法での税込支払い額
  feeRate: number    // 決済手数料率（%）
  feeAmount: number  // 手数料額
}

// ── ユーザー権限 ─────────────────────────────────
// owner=全権 / manager=売上管理の閲覧＋日払い/大入・経費（取引明細は閲覧のみ）/ staff=注文・会計のみ
export type Role = 'owner' | 'manager' | 'staff'

// ── 税の扱い ─────────────────────────────────────
// exclusive: 税抜で登録し会計時に加算 / inclusive: 税込で登録し加算しない
export type TaxMode = 'exclusive' | 'inclusive'
export interface TaxSettings {
  rate: number   // 税率（0.10 = 10%）
  mode: TaxMode
}

// ── 取引（会計完了済み） ─────────────────────────
export interface Transaction {
  id: string
  seatName: string
  solo: boolean
  items: OrderItem[]
  subtotal: number     // 税抜合計
  tax: number
  total: number        // 税込合計
  payMethod: PayMethod  // 単一支払いの方法／分割時は最大金額の方法（表示のフォールバック用）
  feeRate: number      // 決済手数料率（%）／分割時は代表（最大金額）の率
  feeAmount: number    // 手数料額（分割時は内訳の合計）
  netAmount: number    // 実入金額（total − feeAmount）
  payments?: PaymentSplit[]  // 分割支払いの内訳（現金＋カード等）。単一支払いのときは無し
  backThreshold?: number     // 会計時点の「卓バック発生の最低会計額」を焼き付け。未設定=0=条件なし（過去取引は遡及しない）
  primaryCast: string   // 売上が最も多いキャスト（CSV表示用）
  tableCasts: string[]  // 卓バックの受取キャスト（卓の担当。複数なら頭割り）
  completedAt: number   // 会計時刻（Unix ミリ秒）
  openedAt?: number     // 席を立ち上げた時刻（Unix ミリ秒）。旧データには無い
}

// ── 手数料設定 ───────────────────────────────────
export interface FeeSettings {
  card: number   // %
  qr: number     // %
}

// ── 日払い/大入 ──────────────────────────────────
export interface Payout {
  id: string
  date: string             // YYYY-MM-DD（対象日）
  castId: string
  name: string             // 記録時のニックネーム
  realName?: string        // 記録時の本名
  type: 'daily' | 'oiri'   // 日払い / 大入
  amount: number
  at: number               // 記録時刻
}

// ── 経費（単発） ─────────────────────────────────
// オーナーが記録する経費/雑収入。amount は ＋＝収入・戻し、−＝支出。
// 全て現金前提。実際の入金合計とレジの金庫現金の両方から控除（＋は加算）。
export interface Expense {
  id: string
  date: string       // YYYY-MM-DD（対象営業日）
  item: string       // 品目
  amount: number     // 円（＋収入/−支出）
  at: number         // 記録時刻
}

// ── 固定費（定期） ───────────────────────────────
// 毎月◯日 / 毎週◯曜 に自動計上する固定費。全て現金前提で、
// 実際の入金合計に反映し、該当日はレジの金庫現金からも控除する。
export interface RecurringExpense {
  id: string
  item: string
  amount: number                 // 円（＋収入/−支出。通常−）
  cycle: 'monthly' | 'weekly'    // 周期
  day: number                    // monthly: 1-31（日）／weekly: 0-6（0=日）
  at: number
}

// ── レジ締め（日次） ─────────────────────────────
export interface Closure {
  date: string       // YYYY-MM-DD（ドキュメントID）
  closedAt: number   // 締めた時刻
  totalSales: number // 税込売上合計
  cash: number       // 現金売上
  card: number       // カード売上
  qr: number         // QR売上
  totalFee: number   // 決済手数料合計
  totalNet: number   // 実入金合計
  totalBack: number  // バック合計
  txCount: number    // 取引件数
  dailyPay?: number  // 日払い合計
  oiri?: number      // 大入合計
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
