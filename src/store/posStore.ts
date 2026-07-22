/**
 * posStore.ts
 * アプリ全体の状態を Zustand で管理します。
 * - 席・注文はメモリ（セッション中のみ）
 * - 取引完了時に Firebase へ書き込み
 * - メニューは Firebase からリアルタイム購読
 */

import { create } from 'zustand'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { db, auth, COLLECTIONS } from '@/lib/firebase'
import { idToEmail, emailToRole } from '@/lib/authConfig'
import { calcBill, calcFee, DEFAULT_TAX_RATE } from '@/lib/tax'
import { DEFAULT_MENUS } from '@/lib/defaultMenus'
import type { Seat, OrderItem, MenuItem, Cast, Transaction, FeeSettings, PayMethod, Role, TaxMode, TaxSettings, Closure, Punch, Payout, Expense, RecurringExpense } from '@/types'

// 初期投入用のデフォルトキャスト（実データは Firestore で管理）
export const DEFAULT_CASTS = ['さくら', 'あおい', 'ひなた', 'れいな']
export const BACK_RATE = Number(import.meta.env.VITE_BACK_RATE ?? 0.30)

interface PosState {
  // 認証
  user: User | null
  role: Role | null
  authReady: boolean      // 初回の認証状態確認が済んだか
  authError: string | null
  signingIn: boolean

  // 席
  seats: Seat[]
  currentSeatId: string | null

  // 注文（席IDをキーにしたMap）
  orders: Record<string, OrderItem[]>

  // メニュー（Firestoreからリアルタイム購読）
  menus: MenuItem[]
  menusLoading: boolean

  // キャスト（Firestoreからリアルタイム購読）
  casts: Cast[]
  castsLoading: boolean

  // 取引履歴（Firestoreからリアルタイム購読）
  transactions: Transaction[]
  transactionsLoading: boolean

  // 手数料設定
  feeSettings: FeeSettings

  // 卓バック率（会計合計に対する率。例 0.10 = 10%）
  backRate: number

  // キャストドリンクのドリンクバック率（ドリンク料金に対する率。例 0.50 = 50%）
  drinkBackRate: number

  // 卓バックが発生する最低会計額（税込合計がこの額以上のときだけ卓バック。0=条件なし）
  backThreshold: number

  // （旧）カテゴリ別バック率。現行モデルでは未使用だが互換のため保持
  categoryRates: Record<string, number>

  // 消費税の扱い
  taxRate: number      // 0.10 = 10%
  taxMode: TaxMode

  // 入力日（会計を記録する日付。YYYY-MM-DD。遡及入力用に変更可）
  entryDate: string

  // 定型テーブル名（席バーのワンタップ用。例 ['C1','C2',...]）
  tableNames: string[]

  // レジ締め済みの日付（YYYY-MM-DD）の一覧
  closedDates: string[]

  // 打刻（購読中の期間分）
  punches: Punch[]

  // 日払い/大入（購読中の期間分）
  payouts: Payout[]

  // 認証アクション
  initAuth: () => () => void
  signIn: (id: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>

  // メニュー管理（オーナーのみ）
  addMenu: (menu: Omit<MenuItem, 'id'>) => Promise<void>
  updateMenu: (id: string, patch: Partial<Omit<MenuItem, 'id'>>) => Promise<void>
  deleteMenu: (id: string) => Promise<void>
  seedDefaultMenus: () => Promise<void>

  // キャスト管理（オーナーのみ）
  subscribeCasts: () => () => void
  addCast: (nickname: string, realName: string, hourlyWage?: number) => Promise<void>
  updateCast: (id: string, patch: { name?: string; realName?: string; hourlyWage?: number }) => Promise<void>
  deleteCast: (id: string) => Promise<void>
  seedDefaultCasts: () => Promise<void>

  // アクション
  setEntryDate: (date: string) => void
  addSeat: (name: string, solo: boolean) => void
  removeSeat: (seatId: string) => void
  updateSeat: (id: string, patch: Partial<Seat>) => void
  setTableCasts: (seatId: string, casts: string[]) => void
  setCurrentSeat: (id: string) => void

  addOrderItem: (seatId: string, item: Omit<OrderItem, 'id'>) => void
  changeQty: (seatId: string, itemId: string, delta: number) => void
  changeItemCast: (seatId: string, itemId: string, cast: string) => void
  changeItemDrinkBack: (seatId: string, itemId: string, drinkBack: number) => void
  clearOrder: (seatId: string) => void

  completePayment: (
    seatId: string,
    payMethod: PayMethod,
    cashReceived?: number,
    splits?: { method: PayMethod; amount: number }[]
  ) => Promise<void>

  deleteTransaction: (id: string) => Promise<void>
  restoreTransaction: (tx: Transaction) => void

  subscribeMenus: () => () => void
  subscribeTables: () => () => void
  subscribeClosures: () => () => void
  closeDay: (snapshot: Omit<Closure, 'date' | 'closedAt'>) => Promise<void>
  reopenDay: (date: string) => Promise<void>

  subscribePayouts: (from: Date, to: Date) => () => void
  addPayout: (castId: string, type: 'daily' | 'oiri', amount: number) => Promise<void>
  deletePayout: (id: string) => Promise<void>

  expenses: Expense[]
  recurringExpenses: RecurringExpense[]
  subscribeExpenses: (from: Date, to: Date) => () => void
  addExpense: (item: string, amount: number) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  subscribeRecurringExpenses: () => () => void
  addRecurringExpense: (item: string, amount: number, cycle: 'monthly' | 'weekly', day: number) => Promise<void>
  deleteRecurringExpense: (id: string) => Promise<void>

  subscribePunches: (from: Date, to: Date) => () => void
  addPunch: (castId: string, type: 'in' | 'out') => Promise<void>
  addPunchAt: (castId: string, type: 'in' | 'out', at: number) => Promise<void>
  updatePunch: (id: string, at: number, type: 'in' | 'out') => Promise<void>
  deletePunch: (id: string) => Promise<void>
  subscribeTransactions: (from: Date, to: Date) => () => void

  saveFeeSettings: (settings: FeeSettings) => Promise<void>
  loadFeeSettings: () => Promise<void>

  saveBackRate: (rate: number, drinkRate: number, backThreshold: number) => Promise<void>
  loadBackRate: () => Promise<void>

  saveCategoryRates: (rates: Record<string, number>) => Promise<void>
  loadCategoryRates: () => Promise<void>

  saveTaxSettings: (settings: TaxSettings) => Promise<void>
  loadTaxSettings: () => Promise<void>

  saveTableNames: (names: string[]) => Promise<void>
  loadTableNames: () => Promise<void>
}

let seatCounter = 0
const newSeatId = () => `seat-${++seatCounter}-${Date.now()}`
const newItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// YYYY-MM-DD（ローカル日付）
// 営業日の切り替わり時刻（朝5:00）。この時刻を境に「日付」が変わる。
// 深夜帯（翌0:00〜4:59）の売上・打刻は前日の営業日として集計され、朝5時以降は当日扱い。
// ※開店17時ではなく閉店後の早朝を境界にすることで、日中に「今日に戻す」を押しても正しく当日になる。
export const BUSINESS_DAY_START_HOUR = 5
// タイムスタンプ → 営業日（YYYY-MM-DD）。5時より前は前営業日扱い（5h引いてから暦日を取る）
export const dateStrOf = (ts: number) => {
  const d = new Date(ts - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayStr = () => dateStrOf(Date.now())
// 営業日(YYYY-MM-DD)の実時刻の開始（その日の5:00）
export const businessDayStart = (dateStr: string): Date =>
  new Date(`${dateStr}T${String(BUSINESS_DAY_START_HOUR).padStart(2, '0')}:00:00`)
// 営業日(YYYY-MM-DD)の終端＝翌営業日の開始（翌日5:00）。範囲は [start, end) 排他で使う
export const businessDayEnd = (dateStr: string): Date => {
  const d = businessDayStart(dateStr)
  d.setDate(d.getDate() + 1)
  return d
}
// 入力日（entryDate, 営業日 YYYY-MM-DD）から会計時刻を作る。今日ならそのまま現在時刻、過去日ならその営業日内の現在時刻相当
const entryDateToTs = (entryDate: string): number => {
  if (entryDate === todayStr()) return Date.now()
  const d = new Date(`${entryDate}T00:00:00`)
  if (isNaN(d.getTime())) return Date.now()
  const now = new Date()
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  // 5時より前の時刻は翌カレンダー日に置き、営業日が entryDate に一致するようにする
  if (now.getHours() < BUSINESS_DAY_START_HOUR) d.setDate(d.getDate() + 1)
  return d.getTime()
}

// 選択中の席を端末に記憶（リロード後に同じ席へ戻る）
const SEAT_KEY = 'pos:seat'
const readSeat = (): string => {
  try { return localStorage.getItem(SEAT_KEY) || 'A' } catch { return 'A' }
}
const persistSeatId = (id: string | null) => {
  try { if (id) localStorage.setItem(SEAT_KEY, id) } catch { /* ignore */ }
}

export const usePosStore = create<PosState>((set, get) => {
  // 席・未会計注文を Firestore へ保存（fire-and-forget。ローカルは楽観更新済み）
  const persistTable = (seatId: string) => {
    const { seats, orders } = get()
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) {
      deleteDoc(doc(db, COLLECTIONS.TABLES, seatId)).catch(() => {})
      return
    }
    setDoc(doc(db, COLLECTIONS.TABLES, seatId), {
      name: seat.name,
      solo: seat.solo,
      tableCasts: seat.tableCasts,
      items: orders[seatId] ?? [],
      createdAt: seat.createdAt,
      updatedAt: Date.now(),
    }).catch(() => {})
  }

  return {
  user: null,
  role: null,
  authReady: false,
  authError: null,
  signingIn: false,

  seats: [],
  currentSeatId: readSeat(),
  orders: {},
  menus: [],
  menusLoading: true,
  casts: [],
  castsLoading: true,
  transactions: [],
  transactionsLoading: true,
  feeSettings: { card: 3.25, qr: 1.98 },
  backRate: BACK_RATE,
  drinkBackRate: 0,
  backThreshold: 0,
  categoryRates: {},
  taxRate: DEFAULT_TAX_RATE,
  taxMode: 'exclusive',
  entryDate: todayStr(),
  tableNames: [],
  closedDates: [],
  punches: [],
  payouts: [],
  expenses: [],
  recurringExpenses: [],

  // ── 認証 ─────────────────────────────────────
  initAuth: () => {
    const unsub = onAuthStateChanged(auth, (user) => {
      set({
        user,
        role: user ? emailToRole(user.email) : null,
        authReady: true,
      })
    })
    return unsub
  },

  signIn: async (id, password) => {
    set({ signingIn: true, authError: null })
    try {
      await signInWithEmailAndPassword(auth, idToEmail(id), password)
      // role/user は onAuthStateChanged 経由で更新される
    } catch {
      set({ authError: 'ユーザーIDまたはパスワードが違います' })
    } finally {
      set({ signingIn: false })
    }
  },

  signOutUser: async () => {
    await signOut(auth)
    set({ user: null, role: null })
  },

  // ── メニュー管理（オーナーのみ／ルールでも保護） ──
  addMenu: async (menu) => {
    await addDoc(collection(db, COLLECTIONS.MENUS), menu)
  },

  updateMenu: async (id, patch) => {
    await updateDoc(doc(db, COLLECTIONS.MENUS, id), patch)
  },

  deleteMenu: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.MENUS, id))
  },

  seedDefaultMenus: async () => {
    const batch = writeBatch(db)
    DEFAULT_MENUS.forEach((m) => {
      batch.set(doc(collection(db, COLLECTIONS.MENUS)), m)
    })
    await batch.commit()
  },

  // ── キャスト管理（オーナーのみ／ルールでも保護） ──
  subscribeCasts: () => {
    set({ castsLoading: true })
    const q = query(collection(db, COLLECTIONS.CASTS), orderBy('sortOrder'))
    const unsub = onSnapshot(q, (snap) => {
      const casts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cast))
      set({ casts, castsLoading: false })
    })
    return unsub
  },

  addCast: async (nickname, realName, hourlyWage) => {
    const sortOrder = get().casts.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1
    await addDoc(collection(db, COLLECTIONS.CASTS), {
      name: nickname.trim(),
      realName: realName.trim(),
      sortOrder,
      ...(hourlyWage != null && Number.isFinite(hourlyWage) ? { hourlyWage } : {}),
    })
  },

  updateCast: async (id, patch) => {
    await updateDoc(doc(db, COLLECTIONS.CASTS, id), patch)
  },

  deleteCast: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.CASTS, id))
  },

  seedDefaultCasts: async () => {
    const batch = writeBatch(db)
    DEFAULT_CASTS.forEach((name, i) => {
      batch.set(doc(collection(db, COLLECTIONS.CASTS)), { name, sortOrder: (i + 1) * 10 })
    })
    await batch.commit()
  },

  // ── 席 ──────────────────────────────────────
  addSeat: (name, solo) => {
    const id = newSeatId()
    set((s) => ({
      seats: [...s.seats, { id, name, solo, tableCasts: [], createdAt: Date.now() }],
      orders: { ...s.orders, [id]: [] },
      currentSeatId: id,
    }))
    persistSeatId(id)
    persistTable(id)
  },

  // 卓を閉じる（席バーから削除。会計はしない）
  removeSeat: (seatId) => {
    const remaining = get().seats.filter((s) => s.id !== seatId)
    const nextCurrent = get().currentSeatId === seatId ? (remaining[0]?.id ?? null) : get().currentSeatId
    set((s) => {
      const orders = { ...s.orders }
      delete orders[seatId]
      return { seats: remaining, orders, currentSeatId: nextCurrent }
    })
    persistSeatId(nextCurrent)
    deleteDoc(doc(db, COLLECTIONS.TABLES, seatId)).catch(() => {})
  },

  updateSeat: (id, patch) => {
    set((s) => ({
      seats: s.seats.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)),
    }))
    persistTable(id)
  },

  // 卓の担当キャスト（複数可）を設定する
  setTableCasts: (seatId, casts) => {
    set((s) => ({
      seats: s.seats.map((seat) => (seat.id === seatId ? { ...seat, tableCasts: casts } : seat)),
    }))
    persistTable(seatId)
  },

  setEntryDate: (date) => set({ entryDate: date || todayStr() }),

  setCurrentSeat: (id) => { set({ currentSeatId: id }); persistSeatId(id) },

  // ── 注文 ─────────────────────────────────────
  addOrderItem: (seatId, item) => {
    set((s) => {
      const current = s.orders[seatId] ?? []
      // 同名・同キャストなら数量増
      const existing = current.find(
        (x) => x.name === item.name && x.cast === item.cast && !item.isFree
      )
      if (existing) {
        return {
          orders: {
            ...s.orders,
            [seatId]: current.map((x) =>
              x.id === existing.id ? { ...x, qty: x.qty + 1 } : x
            ),
          },
        }
      }
      return {
        orders: {
          ...s.orders,
          [seatId]: [...current, { ...item, id: newItemId() }],
        },
      }
    })
    persistTable(seatId)
  },

  changeQty: (seatId, itemId, delta) => {
    set((s) => {
      const next = (s.orders[seatId] ?? [])
        .map((x) => (x.id === itemId ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0)
      return { orders: { ...s.orders, [seatId]: next } }
    })
    persistTable(seatId)
  },

  changeItemCast: (seatId, itemId, cast) => {
    set((s) => ({
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) =>
          x.id === itemId ? { ...x, cast } : x
        ),
      },
    }))
    persistTable(seatId)
  },

  // キャストドリンクのバック額（円/杯）をその場で上書き。
  // 会計時に明細ごと取引へ焼き付くので非遡及（メニュー変更の影響を受けない）。
  changeItemDrinkBack: (seatId, itemId, drinkBack) => {
    set((s) => ({
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) =>
          x.id === itemId ? { ...x, drinkBack } : x
        ),
      },
    }))
    persistTable(seatId)
  },

  clearOrder: (seatId) => {
    set((s) => ({ orders: { ...s.orders, [seatId]: [] } }))
    persistTable(seatId)
  },

  // ── 会計確定 → Firestore書き込み ─────────────
  completePayment: async (seatId, payMethod, _cashReceived, splits) => {
    const { seats, orders, feeSettings, taxRate, taxMode, entryDate, closedDates, backThreshold } = get()
    // 締め済みの日付には記録できない
    if (closedDates.includes(entryDate)) {
      throw new Error(`${entryDate} は締め済みです。締め解除すると入力できます。`)
    }
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return

    const items = orders[seatId] ?? []
    if (!items.length) return

    const base = items.reduce((sum, x) => sum + x.priceExTax * x.qty, 0)
    const { subtotal, tax, total } = calcBill(base, taxRate, taxMode)

    const feeRateOf = (m: PayMethod) =>
      m === 'card' ? feeSettings.card : m === 'qr' ? feeSettings.qr : 0

    // 分割支払い（現金＋カード等）の内訳を組み立てる。金額0は除外。
    const parts = (splits ?? []).filter((p) => p.amount > 0)
    let payments: Transaction['payments']
    let payMethodFinal = payMethod
    let feeRate: number
    let feeAmount: number

    if (parts.length > 1) {
      payments = parts.map((p) => {
        const fr = feeRateOf(p.method)
        return { method: p.method, amount: p.amount, feeRate: fr, feeAmount: calcFee(p.amount, fr) }
      })
      feeAmount = payments.reduce((s, p) => s + p.feeAmount, 0)
      // 代表の支払い方法＝最も金額が大きい内訳（一覧バッジ等のフォールバック用）
      const top = [...payments].sort((a, b) => b.amount - a.amount)[0]
      payMethodFinal = top.method
      feeRate = top.feeRate
    } else {
      // 単一支払い（分割トグルOFF、または内訳が実質1種類）
      const m = parts.length === 1 ? parts[0].method : payMethod
      payMethodFinal = m
      feeRate = feeRateOf(m)
      feeAmount = calcFee(total, feeRate)
    }
    const netAmount = total - feeAmount

    // 卓の担当キャスト（空を除く。卓バックの頭割り対象）
    const tableCasts = seat.tableCasts.filter(Boolean)

    // 担当売上が最も多いキャストを主担当に（CSV表示用）
    const castSales: Record<string, number> = {}
    items.forEach((x) => {
      if (x.cast) castSales[x.cast] = (castSales[x.cast] ?? 0) + x.priceExTax * x.qty
    })
    const primaryCast =
      Object.entries(castSales).sort(([, a], [, b]) => b - a)[0]?.[0] ??
      tableCasts[0] ??
      ''

    const tx: Omit<Transaction, 'id'> = {
      seatName: seat.name || `席 ${seat.id}`,
      solo: seat.solo,
      items,
      subtotal,
      tax,
      total,
      payMethod: payMethodFinal,
      feeRate,
      feeAmount,
      netAmount,
      ...(payments ? { payments } : {}),
      ...(backThreshold > 0 ? { backThreshold } : {}),
      primaryCast,
      tableCasts,
      completedAt: entryDateToTs(entryDate),
      openedAt: seat.createdAt,
    }

    await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), {
      ...tx,
      _createdAt: serverTimestamp(),
    })

    // 会計後は卓を削除する（席バーから消す）
    const remaining = get().seats.filter((s) => s.id !== seatId)
    const nextCurrent = remaining[0]?.id ?? null
    set((s) => {
      const orders = { ...s.orders }
      delete orders[seatId]
      return { seats: remaining, orders, currentSeatId: nextCurrent }
    })
    persistSeatId(nextCurrent)
    deleteDoc(doc(db, COLLECTIONS.TABLES, seatId)).catch(() => {})
  },

  // ── Firestore 購読 ────────────────────────────
  subscribeTables: () => {
    const q = query(collection(db, COLLECTIONS.TABLES), orderBy('createdAt'))
    const unsub = onSnapshot(q, (snap) => {
      // 卓は「＋追加」で開き、会計後に削除する運用（自動作成はしない）
      const seats: Seat[] = []
      const orders: Record<string, OrderItem[]> = {}
      snap.docs.forEach((d) => {
        const data = d.data() as { name?: string; solo?: boolean; tableCasts?: string[]; defaultCast?: string; items?: OrderItem[]; createdAt?: number }
        seats.push({
          id: d.id,
          name: data.name ?? '',
          solo: !!data.solo,
          // 旧データ（defaultCast）からの移行に対応
          tableCasts: data.tableCasts ?? (data.defaultCast ? [data.defaultCast] : []),
          createdAt: data.createdAt ?? 0,
        })
        orders[d.id] = data.items ?? []
      })
      set((s) => {
        const nextCurrent = seats.some((x) => x.id === s.currentSeatId)
          ? s.currentSeatId
          : (seats[0]?.id ?? null)
        if (nextCurrent !== s.currentSeatId) persistSeatId(nextCurrent)
        return { seats, orders, currentSeatId: nextCurrent }
      })
    }, () => {
      // 権限未設定（ルール未公開）等。ローカルの初期席のまま継続する
    })
    return unsub
  },

  // ── レジ締め ──────────────────────────────────
  subscribeClosures: () => {
    const unsub = onSnapshot(collection(db, COLLECTIONS.CLOSURES), (snap) => {
      set({ closedDates: snap.docs.map((d) => d.id) })
    }, () => { /* ルール未公開等は無視 */ })
    return unsub
  },

  closeDay: async (snapshot) => {
    // 締める日付はヘッダーの入力日（遡及入力で過去日も締められる）
    const date = get().entryDate
    await setDoc(doc(db, COLLECTIONS.CLOSURES, date), {
      ...snapshot,
      date,
      closedAt: Date.now(),
    })
  },

  reopenDay: async (date) => {
    await deleteDoc(doc(db, COLLECTIONS.CLOSURES, date))
  },

  // ── 日払い/大入 ───────────────────────────────
  subscribePayouts: (from, to) => {
    const fromStr = dateStrOf(from.getTime())
    const toStr = dateStrOf(to.getTime())
    const q = query(
      collection(db, COLLECTIONS.PAYOUTS),
      where('date', '>=', fromStr),
      where('date', '<=', toStr),
      orderBy('date', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      set({ payouts: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payout)) })
    }, () => { /* ルール未公開等は無視 */ })
    return unsub
  },

  addPayout: async (castId, type, amount) => {
    const cast = get().casts.find((c) => c.id === castId)
    if (!cast) return
    await addDoc(collection(db, COLLECTIONS.PAYOUTS), {
      date: get().entryDate,
      castId,
      name: cast.name ?? '',
      realName: cast.realName ?? '',
      type,
      amount,
      at: Date.now(),
    })
  },

  deletePayout: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.PAYOUTS, id))
  },

  // ── 経費（単発） ──────────────────────────────
  subscribeExpenses: (from, to) => {
    const fromStr = dateStrOf(from.getTime())
    const toStr = dateStrOf(to.getTime())
    const q = query(
      collection(db, COLLECTIONS.EXPENSES),
      where('date', '>=', fromStr),
      where('date', '<=', toStr),
      orderBy('date', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      set({ expenses: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)) })
    }, () => { /* ルール未公開等は無視 */ })
    return unsub
  },

  addExpense: async (item, amount) => {
    await addDoc(collection(db, COLLECTIONS.EXPENSES), {
      date: get().entryDate,
      item,
      amount,
      at: Date.now(),
    })
  },

  deleteExpense: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.EXPENSES, id))
  },

  // ── 固定費（定期） ────────────────────────────
  subscribeRecurringExpenses: () => {
    const q = query(collection(db, COLLECTIONS.RECURRING_EXPENSES), orderBy('at'))
    const unsub = onSnapshot(q, (snap) => {
      set({ recurringExpenses: snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringExpense)) })
    }, () => { /* ルール未公開等は無視 */ })
    return unsub
  },

  addRecurringExpense: async (item, amount, cycle, day) => {
    await addDoc(collection(db, COLLECTIONS.RECURRING_EXPENSES), {
      item,
      amount,
      cycle,
      day,
      at: Date.now(),
    })
  },

  deleteRecurringExpense: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.RECURRING_EXPENSES, id))
  },

  // ── 打刻 ──────────────────────────────────────
  subscribePunches: (from, to) => {
    const q = query(
      collection(db, COLLECTIONS.PUNCHES),
      where('at', '>=', from.getTime()),
      where('at', '<=', to.getTime()),
      orderBy('at', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      set({ punches: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Punch)) })
    }, () => { /* ルール未公開等は無視 */ })
    return unsub
  },

  addPunch: async (castId, type) => {
    await get().addPunchAt(castId, type, Date.now())
  },

  addPunchAt: async (castId, type, at) => {
    const cast = get().casts.find((c) => c.id === castId)
    if (!cast) return
    await addDoc(collection(db, COLLECTIONS.PUNCHES), {
      castId,
      name: cast.name ?? '',
      realName: cast.realName ?? '',
      type,
      at,
      date: dateStrOf(at),
      by: get().role ?? '',
    })
  },

  updatePunch: async (id, at, type) => {
    await updateDoc(doc(db, COLLECTIONS.PUNCHES, id), { at, type, date: dateStrOf(at) })
  },

  deletePunch: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.PUNCHES, id))
  },

  subscribeMenus: () => {
    set({ menusLoading: true })
    const q = query(collection(db, COLLECTIONS.MENUS), orderBy('sortOrder'))
    const unsub = onSnapshot(q, (snap) => {
      const menus = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MenuItem))
      set({ menus, menusLoading: false })
    })
    return unsub
  },

  subscribeTransactions: (from, to) => {
    set({ transactionsLoading: true })
    // 期間で絞り込んでから取得（全件取得を避ける）
    const q = query(
      collection(db, COLLECTIONS.TRANSACTIONS),
      where('completedAt', '>=', from.getTime()),
      where('completedAt', '<=', to.getTime()),
      orderBy('completedAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      const transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction))
      set({ transactions, transactionsLoading: false })
    })
    return unsub
  },

  // ── 完了した会計の削除・編集（オーナー） ──────────
  deleteTransaction: async (id) => {
    await deleteDoc(doc(db, COLLECTIONS.TRANSACTIONS, id))
  },

  // 編集：元取引を削除し、内容を空き卓に復元。入力日も元の日に合わせる
  restoreTransaction: (tx) => {
    const id = newSeatId()
    const items = tx.items.map((it) => ({ ...it, id: newItemId() }))
    set((s) => ({
      seats: [...s.seats, { id, name: tx.seatName ?? '', solo: !!tx.solo, tableCasts: tx.tableCasts ?? [], createdAt: tx.openedAt ?? Date.now() }],
      orders: { ...s.orders, [id]: items },
      currentSeatId: id,
      entryDate: dateStrOf(tx.completedAt),
    }))
    persistSeatId(id)
    persistTable(id)
    deleteDoc(doc(db, COLLECTIONS.TRANSACTIONS, tx.id)).catch(() => {})
  },

  // ── 手数料設定の永続化 ─────────────────────────
  saveFeeSettings: async (settings) => {
    set({ feeSettings: settings })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'fees'), settings)
  },

  loadFeeSettings: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'fees'))
    if (snap.exists()) {
      set({ feeSettings: snap.data() as FeeSettings })
    }
  },

  // ── バック率の永続化（卓バック率＋ドリンクバック率＋卓バック発生の最低会計額） ──
  saveBackRate: async (rate, drinkRate, backThreshold) => {
    set({ backRate: rate, drinkBackRate: drinkRate, backThreshold })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'back'), { rate, drinkRate, backThreshold })
  },

  loadBackRate: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'back'))
    if (snap.exists()) {
      const d = snap.data() as { rate?: number; drinkRate?: number; backThreshold?: number }
      set({
        backRate: d.rate ?? BACK_RATE,
        drinkBackRate: d.drinkRate ?? 0,
        backThreshold: d.backThreshold ?? 0,
      })
    }
  },

  // ── カテゴリ別バック率の永続化 ─────────────────
  saveCategoryRates: async (rates) => {
    set({ categoryRates: rates })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'categoryRates'), rates)
  },

  loadCategoryRates: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'categoryRates'))
    if (snap.exists()) {
      set({ categoryRates: snap.data() as Record<string, number> })
    }
  },

  // ── 消費税設定の永続化 ─────────────────────────
  saveTaxSettings: async (settings) => {
    set({ taxRate: settings.rate, taxMode: settings.mode })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'tax'), settings)
  },

  loadTaxSettings: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'tax'))
    if (snap.exists()) {
      const d = snap.data() as TaxSettings
      set({ taxRate: d.rate, taxMode: d.mode })
    }
  },

  // ── 定型テーブル名の永続化 ─────────────────────
  saveTableNames: async (names) => {
    set({ tableNames: names })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'tableNames'), { names })
  },

  loadTableNames: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'tableNames'))
    if (snap.exists()) {
      set({ tableNames: (snap.data() as { names?: string[] }).names ?? [] })
    }
  },
  }
})
