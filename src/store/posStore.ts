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
import { calcTax, calcFee } from '@/lib/tax'
import { DEFAULT_MENUS } from '@/lib/defaultMenus'
import type { Seat, OrderItem, MenuItem, Cast, Transaction, FeeSettings, PayMethod, Role } from '@/types'

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

  // バック率（0.30 = 30%）
  backRate: number

  // カテゴリ別バック率（例 { 'キャストドリンク': 0.5 }。未設定は backRate を使う）
  categoryRates: Record<string, number>

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
  addCast: (name: string) => Promise<void>
  updateCast: (id: string, name: string) => Promise<void>
  deleteCast: (id: string) => Promise<void>
  seedDefaultCasts: () => Promise<void>

  // アクション
  addSeat: (name: string, solo: boolean) => void
  updateSeat: (id: string, patch: Partial<Seat>) => void
  setSeatCast: (seatId: string, cast: string) => void
  setCurrentSeat: (id: string) => void

  addOrderItem: (seatId: string, item: Omit<OrderItem, 'id'>) => void
  changeQty: (seatId: string, itemId: string, delta: number) => void
  changeItemCast: (seatId: string, itemId: string, cast: string) => void
  toggleItemFullBack: (seatId: string, itemId: string) => void
  clearOrder: (seatId: string) => void

  completePayment: (
    seatId: string,
    payMethod: PayMethod,
    cashReceived?: number
  ) => Promise<void>

  subscribeMenus: () => () => void
  subscribeTransactions: (from: Date, to: Date) => () => void

  saveFeeSettings: (settings: FeeSettings) => Promise<void>
  loadFeeSettings: () => Promise<void>

  saveBackRate: (rate: number) => Promise<void>
  loadBackRate: () => Promise<void>

  saveCategoryRates: (rates: Record<string, number>) => Promise<void>
  loadCategoryRates: () => Promise<void>
}

let seatCounter = 0
const newSeatId = () => `seat-${++seatCounter}-${Date.now()}`
const newItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const usePosStore = create<PosState>((set, get) => ({
  user: null,
  role: null,
  authReady: false,
  authError: null,
  signingIn: false,

  seats: [
    { id: 'A', name: '', solo: false, defaultCast: '', createdAt: Date.now() },
    { id: 'B', name: '', solo: false, defaultCast: '', createdAt: Date.now() },
    { id: 'C', name: '', solo: false, defaultCast: '', createdAt: Date.now() },
  ],
  currentSeatId: 'A',
  orders: { A: [], B: [], C: [] },
  menus: [],
  menusLoading: true,
  casts: [],
  castsLoading: true,
  transactions: [],
  transactionsLoading: true,
  feeSettings: { card: 3.25, qr: 1.98 },
  backRate: BACK_RATE,
  categoryRates: {},

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

  addCast: async (name) => {
    const sortOrder = get().casts.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1
    await addDoc(collection(db, COLLECTIONS.CASTS), { name, sortOrder })
  },

  updateCast: async (id, name) => {
    await updateDoc(doc(db, COLLECTIONS.CASTS, id), { name })
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
      seats: [...s.seats, { id, name, solo, defaultCast: '', createdAt: Date.now() }],
      orders: { ...s.orders, [id]: [] },
      currentSeatId: id,
    }))
  },

  updateSeat: (id, patch) =>
    set((s) => ({
      seats: s.seats.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)),
    })),

  // 席の担当キャストを変更し、その席の注文中の全商品にも担当を反映する
  setSeatCast: (seatId, cast) =>
    set((s) => ({
      seats: s.seats.map((seat) => (seat.id === seatId ? { ...seat, defaultCast: cast } : seat)),
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) => ({ ...x, cast })),
      },
    })),

  setCurrentSeat: (id) => set({ currentSeatId: id }),

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
  },

  changeQty: (seatId, itemId, delta) =>
    set((s) => {
      const next = (s.orders[seatId] ?? [])
        .map((x) => (x.id === itemId ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0)
      return { orders: { ...s.orders, [seatId]: next } }
    }),

  changeItemCast: (seatId, itemId, cast) =>
    set((s) => ({
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) =>
          x.id === itemId ? { ...x, cast } : x
        ),
      },
    })),

  toggleItemFullBack: (seatId, itemId) =>
    set((s) => ({
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) =>
          x.id === itemId ? { ...x, fullBack: !x.fullBack } : x
        ),
      },
    })),

  clearOrder: (seatId) =>
    set((s) => ({ orders: { ...s.orders, [seatId]: [] } })),

  // ── 会計確定 → Firestore書き込み ─────────────
  completePayment: async (seatId, payMethod, _cashReceived) => {
    const { seats, orders, feeSettings } = get()
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return

    const items = orders[seatId] ?? []
    if (!items.length) return

    const subtotal = items.reduce((sum, x) => sum + x.priceExTax * x.qty, 0)
    const tax = calcTax(subtotal)
    const total = subtotal + tax

    const feeRate =
      payMethod === 'card' ? feeSettings.card :
      payMethod === 'qr'   ? feeSettings.qr   : 0
    const feeAmount = calcFee(total, feeRate)
    const netAmount = total - feeAmount

    // 担当売上が最も多いキャストを主担当に
    const castSales: Record<string, number> = {}
    items.forEach((x) => {
      if (x.cast) castSales[x.cast] = (castSales[x.cast] ?? 0) + x.priceExTax * x.qty
    })
    const primaryCast =
      Object.entries(castSales).sort(([, a], [, b]) => b - a)[0]?.[0] ??
      seat.defaultCast ??
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
      completedAt: Date.now(),
    }

    await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), {
      ...tx,
      _createdAt: serverTimestamp(),
    })

    // 注文をクリア
    set((s) => ({ orders: { ...s.orders, [seatId]: [] } }))
  },

  // ── Firestore 購読 ────────────────────────────
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

  // ── バック率の永続化 ───────────────────────────
  saveBackRate: async (rate) => {
    set({ backRate: rate })
    await setDoc(doc(db, COLLECTIONS.SETTINGS, 'back'), { rate })
  },

  loadBackRate: async () => {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, 'back'))
    if (snap.exists()) {
      set({ backRate: (snap.data() as { rate: number }).rate })
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
}))
