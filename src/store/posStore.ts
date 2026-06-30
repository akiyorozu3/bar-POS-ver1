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
import type { Seat, OrderItem, MenuItem, Cast, Transaction, FeeSettings, PayMethod, Role, TaxMode, TaxSettings } from '@/types'

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

  // 消費税の扱い
  taxRate: number      // 0.10 = 10%
  taxMode: TaxMode

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
  subscribeTables: () => () => void
  subscribeTransactions: (from: Date, to: Date) => () => void

  saveFeeSettings: (settings: FeeSettings) => Promise<void>
  loadFeeSettings: () => Promise<void>

  saveBackRate: (rate: number) => Promise<void>
  loadBackRate: () => Promise<void>

  saveCategoryRates: (rates: Record<string, number>) => Promise<void>
  loadCategoryRates: () => Promise<void>

  saveTaxSettings: (settings: TaxSettings) => Promise<void>
  loadTaxSettings: () => Promise<void>
}

let seatCounter = 0
const newSeatId = () => `seat-${++seatCounter}-${Date.now()}`
const newItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

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
      defaultCast: seat.defaultCast,
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
  taxRate: DEFAULT_TAX_RATE,
  taxMode: 'exclusive',

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
    persistTable(id)
  },

  updateSeat: (id, patch) => {
    set((s) => ({
      seats: s.seats.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)),
    }))
    persistTable(id)
  },

  // 席の担当キャストを変更し、その席の注文中の全商品にも担当を反映する
  setSeatCast: (seatId, cast) => {
    set((s) => ({
      seats: s.seats.map((seat) => (seat.id === seatId ? { ...seat, defaultCast: cast } : seat)),
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) => ({ ...x, cast })),
      },
    }))
    persistTable(seatId)
  },

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

  toggleItemFullBack: (seatId, itemId) => {
    set((s) => ({
      orders: {
        ...s.orders,
        [seatId]: (s.orders[seatId] ?? []).map((x) =>
          x.id === itemId ? { ...x, fullBack: !x.fullBack } : x
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
    const { seats, orders, feeSettings, taxRate, taxMode } = get()
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
            name: '', solo: false, defaultCast: '', items: [],
            createdAt: now + i, updatedAt: now,
          }).catch(() => {})
        })
        return
      }
      const seats: Seat[] = []
      const orders: Record<string, OrderItem[]> = {}
      snap.docs.forEach((d) => {
        const data = d.data() as { name?: string; solo?: boolean; defaultCast?: string; items?: OrderItem[]; createdAt?: number }
        seats.push({
          id: d.id,
          name: data.name ?? '',
          solo: !!data.solo,
          defaultCast: data.defaultCast ?? '',
          createdAt: data.createdAt ?? 0,
        })
        orders[d.id] = data.items ?? []
      })
      set((s) => ({
        seats,
        orders,
        currentSeatId: seats.some((x) => x.id === s.currentSeatId)
          ? s.currentSeatId
          : (seats[0]?.id ?? null),
      }))
    }, () => {
      // 権限未設定（ルール未公開）等。ローカルの初期席のまま継続する
    })
    return unsub
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
