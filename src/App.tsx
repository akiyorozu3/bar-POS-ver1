import { useEffect, useState } from 'react'
import { usePosStore, todayStr } from '@/store/posStore'
import OrderScreen from '@/components/OrderScreen'
import CheckoutScreen from '@/components/CheckoutScreen'
import SalesScreen from '@/components/SalesScreen'
import MenuManageScreen from '@/components/MenuManageScreen'
import CastManageScreen from '@/components/CastManageScreen'
import PunchModal from '@/components/PunchModal'
import PunchManageScreen from '@/components/PunchManageScreen'
import ShiftScreen from '@/components/ShiftScreen'
import VaultScreen from '@/components/VaultScreen'
import DailyReportScreen from '@/components/DailyReportScreen'
import LoginScreen from '@/components/LoginScreen'
import { startVersionCheck } from '@/lib/versionCheck'

type Screen = 'order' | 'checkout' | 'sales' | 'vault' | 'shift' | 'daily' | 'menu' | 'cast' | 'punchmgr'

// 打刻をスタッフにも開放（打刻管理タブはオーナーのみのまま）
const PUNCH_STAFF_ENABLED = true

// テスト環境（staging）では画面上部に警告バナーを出し、本番との取り違えを防ぐ
const IS_TEST_ENV = import.meta.env.VITE_APP_ENV === 'staging'

function TestEnvBanner() {
  return (
    <div className="test-env-banner">
      🧪 テスト環境（練習用）— ここでの入力は本番に反映されません
    </div>
  )
}

// 店識別バンド：env で店名/帯色が指定された店だけ、画面上部に常時表示して取り違えを防ぐ。
// 1店目など未設定の店では何も出さない（現状のまま）。
const STORE_NAME = import.meta.env.VITE_STORE_NAME as string | undefined
const STORE_COLOR = (import.meta.env.VITE_STORE_COLOR as string | undefined) || '#378add'

function StoreBand() {
  if (!STORE_NAME) return null
  return (
    <div className="store-band" style={{ background: STORE_COLOR }}>
      <i className="ti ti-building-store" aria-hidden /> {STORE_NAME}
    </div>
  )
}

// 店色（VITE_STORE_COLOR）が指定された店では、アプリ全体のアクセント（既定の青）を店色へ差し替える。
// 濃い変種（テキスト用）は店色を少し暗くして自動生成。未指定の店は :root の青のまま。
const STORE_ACCENT = import.meta.env.VITE_STORE_COLOR as string | undefined
function darkenHex(hex: string, amt = 0.78): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.round(((n >> 16) & 255) * amt)
  const g = Math.round(((n >> 8) & 255) * amt)
  const b = Math.round((n & 255) * amt)
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}
if (STORE_ACCENT && typeof document !== 'undefined') {
  const root = document.documentElement
  root.style.setProperty('--accent', STORE_ACCENT)
  root.style.setProperty('--accent-strong', darkenHex(STORE_ACCENT))
}

const readScreen = (): Screen => {
  try { return (localStorage.getItem('pos:screen') as Screen) || 'order' } catch { return 'order' }
}

export default function App() {
  const [screen, setScreenRaw] = useState<Screen>(readScreen)
  const [showPunch, setShowPunch] = useState(false)
  const [newVersion, setNewVersion] = useState(false)
  const setScreen = (s: Screen) => {
    setScreenRaw(s)
    try { localStorage.setItem('pos:screen', s) } catch { /* ignore */ }
  }
  const {
    user, role, authReady,
    initAuth, signOutUser,
    subscribeMenus, subscribeCasts, subscribeTables, subscribeClosures, loadFeeSettings, loadBackRate, loadOiriTiers, loadCategoryRates, loadTaxSettings, loadTableNames,
    entryDate, setEntryDate,
  } = usePosStore()

  const isOwner = role === 'owner'
  const isZeimu = role === 'zeimu'                          // 税務（閲覧のみ）
  const canManage = role === 'owner' || role === 'manager'  // 入力を伴う操作ができる権限（シフト・日払い等）
  const canSales = canManage || isZeimu                     // 売上管理・金庫を開ける権限（税務は閲覧のみ）
  const canChangeDate = role !== 'staff'                    // ヘッダー日付の変更は staff 以外（税務は閲覧用に可）
  const backdated = entryDate !== todayStr()
  // ヘッダー日付を ±1日ずらす（未来日は不可）
  const shiftEntryDate = (delta: number) => {
    const d = new Date(`${entryDate}T12:00:00`)
    d.setDate(d.getDate() + delta)
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (s > todayStr()) return
    setEntryDate(s)
  }

  // 認証状態の購読（初回マウント時）
  useEffect(() => {
    const unsub = initAuth()
    return unsub
  }, [initAuth])

  // アプリの自動アップデート検知（新しい版が出たらバナーを表示）
  useEffect(() => startVersionCheck(() => setNewVersion(true)), [])

  // ログイン後にメニュー・キャスト・設定を購読・ロード（Firestoreは認証必須）
  useEffect(() => {
    if (!user) return
    const unsubMenus = subscribeMenus()
    const unsubCasts = subscribeCasts()
    const unsubTables = subscribeTables()
    const unsubClosures = subscribeClosures()
    loadFeeSettings()
    loadBackRate()
    loadOiriTiers()
    loadCategoryRates()
    loadTaxSettings()
    loadTableNames()
    return () => { unsubMenus(); unsubCasts(); unsubTables(); unsubClosures() }
  }, [user, subscribeMenus, subscribeCasts, subscribeTables, subscribeClosures, loadFeeSettings, loadBackRate, loadOiriTiers, loadCategoryRates, loadTaxSettings, loadTableNames])

  // 権限が変わったら、許可されない画面からは適切な初期画面に戻す
  useEffect(() => {
    const home = isZeimu ? 'sales' : 'order'   // 税務は注文入力を使わないので売上管理をホームに
    if ((screen === 'sales' || screen === 'vault') && !canSales) setScreen(home)
    if (screen === 'shift' && !canSales) setScreen(home)   // シフトは owner/manager/zeimu（zeimuは閲覧のみ）
    if ((screen === 'menu' || screen === 'cast' || screen === 'punchmgr') && !isOwner) setScreen(home)
    // 税務は注文入力・会計を開けない
    if ((screen === 'order' || screen === 'checkout') && isZeimu) setScreen('sales')
  }, [isOwner, isZeimu, canSales, canManage, screen])

  // スタッフは日付変更不可＝常に今日に固定。17時の日付切替をまたいでも最新化されるよう定期的に同期
  // （アプリを開きっぱなしで entryDate が前営業日のまま固定される不具合の防止）
  useEffect(() => {
    if (role !== 'staff') return
    const sync = () => { if (usePosStore.getState().entryDate !== todayStr()) setEntryDate(todayStr()) }
    sync()
    const id = setInterval(sync, 60000)
    return () => clearInterval(id)
  }, [role, setEntryDate])

  // 会計へ遷移イベント（OrderScreen から発火）
  useEffect(() => {
    const toCheckout = () => setScreen('checkout')
    const toOrder = () => setScreen('order')
    document.addEventListener('pos:go-checkout', toCheckout)
    document.addEventListener('pos:go-order', toOrder)
    return () => {
      document.removeEventListener('pos:go-checkout', toCheckout)
      document.removeEventListener('pos:go-order', toOrder)
    }
  }, [])

  // 認証確認中
  if (!authReady) return <div className="app"><div className="loading">読み込み中...</div></div>

  // 未ログイン
  if (!user) return (
    <>
      <StoreBand />
      {IS_TEST_ENV && <TestEnvBanner />}
      <LoginScreen />
    </>
  )

  return (
    <div className="app">
      {newVersion && (
        <div className="update-banner" onClick={() => location.reload()}>
          🔄 新しいバージョンがあります — タップして更新
        </div>
      )}
      <StoreBand />
      {IS_TEST_ENV && <TestEnvBanner />}
      {/* トップバー（ユーザー情報・ログアウト） */}
      <div className={`topbar ${backdated ? 'backdated' : ''}`}>
        <span className="topbar-role">
          {role === 'owner' ? 'オーナー' : role === 'manager' ? 'マネージャー' : role === 'zeimu' ? '税務' : 'スタッフ'}
        </span>
        <label className="topbar-date">
          <span className="topbar-date-lbl">{canChangeDate && backdated ? '遡及入力 ⚠' : '日付'}</span>
          {canChangeDate ? (
            <>
              <span className="topbar-date-nav">
                <button className="date-step" onClick={() => shiftEntryDate(-1)} title="前の日" aria-label="前の日">‹</button>
                <input
                  type="date"
                  value={entryDate}
                  max={todayStr()}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
                <button className="date-step" onClick={() => shiftEntryDate(1)} disabled={!backdated} title="次の日" aria-label="次の日">›</button>
              </span>
              {backdated && (
                <button className="topbar-date-today" onClick={() => setEntryDate(todayStr())}>今日に戻す</button>
              )}
            </>
          ) : (
            <span className="topbar-date-fixed">{todayStr()}</span>
          )}
        </label>
        {(isOwner || (PUNCH_STAFF_ENABLED && role === 'staff')) && (
          <button className="punch-open-btn" onClick={() => setShowPunch(true)}>
            <i className="ti ti-clock" aria-hidden /> 打刻
          </button>
        )}
        <button className="logout-btn" onClick={signOutUser}>
          <i className="ti ti-logout" aria-hidden /> ログアウト
        </button>
      </div>

      {showPunch && <PunchModal onClose={() => setShowPunch(false)} />}

      {/* ナビゲーション */}
      <nav className="nav">
        {!isZeimu && (
          <button
            className={`nav-btn ${screen === 'order' ? 'active' : ''}`}
            onClick={() => setScreen('order')}
          >
            <i className="ti ti-pencil" aria-hidden /> 注文入力
          </button>
        )}
        {!isZeimu && (
          <button
            className={`nav-btn ${screen === 'checkout' ? 'active' : ''}`}
            onClick={() => setScreen('checkout')}
          >
            <i className="ti ti-receipt" aria-hidden /> 会計
          </button>
        )}
        <button
          className={`nav-btn ${screen === 'daily' ? 'active' : ''}`}
          onClick={() => setScreen('daily')}
        >
          <i className="ti ti-notebook" aria-hidden /> 日報
        </button>
        {canSales && (
          <button
            className={`nav-btn ${screen === 'sales' ? 'active' : ''}`}
            onClick={() => setScreen('sales')}
          >
            <i className="ti ti-chart-bar" aria-hidden /> 売上管理
          </button>
        )}
        {canSales && (
          <button
            className={`nav-btn ${screen === 'vault' ? 'active' : ''}`}
            onClick={() => setScreen('vault')}
          >
            <i className="ti ti-building-bank" aria-hidden /> 金庫
          </button>
        )}
        {canSales && (
          <button
            className={`nav-btn ${screen === 'shift' ? 'active' : ''}`}
            onClick={() => setScreen('shift')}
          >
            <i className="ti ti-calendar-week" aria-hidden /> シフト
          </button>
        )}
        {isOwner && (
          <button
            className={`nav-btn ${screen === 'menu' ? 'active' : ''}`}
            onClick={() => setScreen('menu')}
          >
            <i className="ti ti-list-details" aria-hidden /> メニュー管理
          </button>
        )}
        {isOwner && (
          <button
            className={`nav-btn ${screen === 'cast' ? 'active' : ''}`}
            onClick={() => setScreen('cast')}
          >
            <i className="ti ti-users" aria-hidden /> キャスト管理
          </button>
        )}
        {isOwner && (
          <button
            className={`nav-btn ${screen === 'punchmgr' ? 'active' : ''}`}
            onClick={() => setScreen('punchmgr')}
          >
            <i className="ti ti-clock" aria-hidden /> 打刻管理
          </button>
        )}
      </nav>

      {/* 画面 */}
      <main className="main">
        {screen === 'order' && <OrderScreen />}
        {screen === 'checkout' && (
          <CheckoutScreen onBack={() => setScreen('order')} />
        )}
        {screen === 'sales' && canSales && <SalesScreen />}
        {screen === 'vault' && canSales && <VaultScreen />}
        {screen === 'daily' && <DailyReportScreen />}
        {screen === 'shift' && canSales && <ShiftScreen />}
        {screen === 'menu' && isOwner && <MenuManageScreen />}
        {screen === 'cast' && isOwner && <CastManageScreen />}
        {screen === 'punchmgr' && isOwner && <PunchManageScreen />}
      </main>
    </div>
  )
}
