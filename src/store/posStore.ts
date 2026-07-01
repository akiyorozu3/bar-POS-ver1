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
import type { Seat, OrderItem, MenuItem, Cast, Transaction, FeeSettings, PayMethod, Role, TaxMode, TaxSettings, Closure, Punch } from '@/types'

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

  // （旧）カテゴリ別バック率。現行モデルでは未使用だが互換のため保持
  categoryRates: Record<string, number>

  // 消費税の扱い
  taxRate: number      // 0.10 = 10%
  taxMode: TaxMode

  // 入力日（会計を記録する日付。YYYY-MM-DD。遡及入力用に変更可）
  entryDate: string

  // レジ締め済みの日付（YYYY-MM-DD）の一覧
  closedDates: string[]

  // 打刻（購読中の期間分）
  punches: Punch[]

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
  addCast: (nickname: string, realName: string) => Promise<void>
  updateCast: (id: string, patch: { name?: string; realName?: string }) => Promise<void>
  deleteCast: (id: string) => Promise<void>
  seedDefaultCasts: () => Promise<void>

  // アクション
  setEntryDate: (date: string) => void
  addSeat: (name: string, solo: boolean) => void
  updateSeat: (id: string, patch: Partial<Seat>) => void
  setTableCasts: (seatId: string, casts: string[]) => void
  setCurrentSeat: (id: string) => void

  addOrderItem: (seatId: string, item: Omit<OrderItem, 'id'>) => void
  changeQty: (seatId: string, itemId: string, delta: number) => void
  changeItemCast: (seatId: string, itemId: string, cast: string) => void
  clearOrder: (seatId: string) => void

  completePayment: (
    seatId: string,
    payMethod: PayMethod,
    cashReceived?: number
  ) => Promise<void>

  subscribeMenus: () => () => void
  subscribeTables: () => () => void
  subscribeClosures: () => () => void
  closeDay: (snapshot: Omit<Closure, 'date' | 'closedAt'>) => Promise<void>
  reopenDay: (date: string) => Promise<void>

  subscribePunches: (from: Date, to: Date) => () => void
  addPunch: (castId: string, type: 'in' | 'out') => Promise<void>
  addPunchAt: (castId: string, type: 'in' | 'out', at: number) => Promise<void>
  updatePunch: (id: string, at: number, type: 'in' | 'out') => Promise<void>
  deletePunch: (id: string) => Promise<void>
  subscribeTransactions: (from: Date, to: Date) => () => void

  saveFeeSettings: (settings: FeeSettings) => Promise<void>
  loadFeeSettings: () => Promise<void>

  saveBackRate: (rate: number, drinkRate: number) => Promise<void>
  loadBackRate: () => Promise<void>

  saveCategoryRates: (rates: Record<string, number>) => Promise<void>
  loadCategoryRates: () => Promise<void>

  saveTaxSettings: (settings: TaxSettings) => Promise<void>
  loadTaxSettings: () => Promise<void>
}

let seatCounter = 0
const newSeatId = () => `seat-${++seatCounter}-${Date.now()}`
const newItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// YYYY-MM-DD（ローカル日付）
export const dateStrOf = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayStr = () => dateStrOf(Date.now())
// 入力日（entryDate, YYYY-MM-DD）から会計時刻を作る。今日ならそのまま現在時刻、過去日ならその日付＋現在時刻
const entryDateToTs = (entryDate: string): number => {
  if (entryDate === todayStr()) return Date.now()
  const d = new Date(`${entryDate}T00:00:00`)
  if (isNaN(d.getTime())) return Date.now()
  const now = new Date()
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
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

  seats: [
    { id: 'A', name: '', solo: false, tableCasts: [], createdAt: Date.now() },
    { id: 'B', name: '', solo: false, tableCasts: [], createdAt: Date.now() },
    { id: 'C', name: '', solo: false, tableCasts: [], createdAt: Date.now() },
  ],
  currentSeatId: readSeat(),
  orders: { A: [], B: [], C: [] },
  menus: [],
  menusLoading: true,
  casts: [],
  castsLoading: true,
  transactions: [],
  transactionsLoading: true,
  feeSettings: { card: 3.25, qr: 1.98 },
  backRate: BACK_RATE,
  drinkBackRate: 0,
  categoryRates: {},
  taxRate: DEFAULT_TAX_RATE,
  taxMode: 'exclusive',
  entryDate: todayStr(),
  closedDates: [],
  punches: [],

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

  addCast: async (nickname, realName) => {
    const sortOrder = get().casts.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1
    await addDoc(collection(db, COLLECTIONS.CASTS), {
      name: nickname.trim(),
      realName: realName.trim(),
      sortOrder,
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

  clearOrder: (seatId) => {
    set((s) => ({ orders: { ...s.orders, [seatId]: [] } }))
    persistTable(seatId)
  },

  // ── 会計確定 → Firestore書き込み ─────────────
  completePayment: async (seatId, payMethod, _cashReceived) => {
    const { seats, orders, feeSettings, taxRate, taxMode, entryDate, closedDates } = get()
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

    const feeRate =
      payMethod === 'card' ? feeSettings.card :
      payMethod === 'qr'   ? feeSettings.qr   : 0
    const feeAmount = calcFee(total, feeRate)
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
      payMethod,
      feeRate,
      feeAmount,
      netAmount,
      primaryCast,
      tableCasts,
      completedAt: entryDateToTs(entryDate),
    }

    await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), {
      ...tx,
      _createdAt: serverTimestamp(),
    })

    // 注文をクリア（席は残す）
    set((s) => ({ orders: { ...s.orders, [seatId]: [] } }))
    persistTable(seatId)
  },

  // ── Firestore 購読 ────────────────────────────
  subscribeTables: () => {
    const q = query(collection(db, COLLECTIONS.TABLES), orderBy('createdAt'))
    const unsub = onSnapshot(q, (snap) => {
      // 初回（空）はデフォルト席 A/B/C を作成（固定IDなので重複しない）
      if (snap.empty) {
        const now = Date.now()
        ;['A', 'B', 'C'].forEach((id, i) => {
          setDoc(doc(db, COLLECTIONS.TABLES, id), {
            name: '', solo: false, tableCasts: [], items: [],
            createdAt: now + i, updatedAt: now,
          }).catch(() => {})
        })
        return
      }
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

  // ── バック率の永続化（卓バック率＋ドリンクバック率） ──
  saveBackRate: async (rate, drinkRate) => {
    set({ backRate: rate, drinkBackRate: drinkRate })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'back'), { rate, drinkRate })
  },

  loadBackRate: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'back'))
    if (snap.exists()) {
      const d = snap.data() as { rate?: number; drinkRate?: number }
      set({
        backRate: d.rate ?? BACK_RATE,
        drinkBackRate: d.drinkRate ?? 0,
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
  }
})
