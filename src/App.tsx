import { useEffect, useState } from 'react'
import { usePosStore, todayStr } from '@/store/posStore'
import OrderScreen from '@/components/OrderScreen'
import CheckoutScreen from '@/components/CheckoutScreen'
import SalesScreen from '@/components/SalesScreen'
import MenuManageScreen from '@/components/MenuManageScreen'
import CastManageScreen from '@/components/CastManageScreen'
import PunchModal from '@/components/PunchModal'
import PunchManageScreen from '@/components/PunchManageScreen'
import LoginScreen from '@/components/LoginScreen'
import { startVersionCheck } from '@/lib/versionCheck'

type Screen = 'order' | 'checkout' | 'sales' | 'menu' | 'cast' | 'punchmgr'

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
    subscribeMenus, subscribeCasts, subscribeTables, subscribeClosures, loadFeeSettings, loadBackRate, loadCategoryRates, loadTaxSettings, loadTableNames,
    entryDate, setEntryDate,
  } = usePosStore()

  const isOwner = role === 'owner'
  const canSales = role === 'owner' || role === 'manager'   // 売上管理を開ける権限
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
    loadCategoryRates()
    loadTaxSettings()
    loadTableNames()
    return () => { unsubMenus(); unsubCasts(); unsubTables(); unsubClosures() }
  }, [user, subscribeMenus, subscribeCasts, subscribeTables, subscribeClosures, loadFeeSettings, loadBackRate, loadCategoryRates, loadTaxSettings, loadTableNames])

  // 権限が変わったら、許可されない画面からは注文入力に戻す
  useEffect(() => {
    if (screen === 'sales' && !canSales) setScreen('order')
    if ((screen === 'menu' || screen === 'cast' || screen === 'punchmgr') && !isOwner) setScreen('order')
  }, [isOwner, canSales, screen])

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
      {IS_TEST_ENV && <TestEnvBanner />}
      {/* トップバー（ユーザー情報・ログアウト） */}
      <div className={`topbar ${backdated ? 'backdated' : ''}`}>
        <span className="topbar-role">
          {role === 'owner' ? 'オーナー' : role === 'manager' ? 'マネージャー' : 'スタッフ'}
        </span>
        <label className="topbar-date">
          <span className="topbar-date-lbl">{backdated ? '遡及入力 ⚠' : '日付'}</span>
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
        </label>
        {(isOwner || PUNCH_STAFF_ENABLED) && (
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
        <button
          className={`nav-btn ${screen === 'order' ? 'active' : ''}`}
          onClick={() => setScreen('order')}
        >
          <i className="ti ti-pencil" aria-hidden /> 注文入力
        </button>
        <button
          className={`nav-btn ${screen === 'checkout' ? 'active' : ''}`}
          onClick={() => setScreen('checkout')}
        >
          <i className="ti ti-receipt" aria-hidden /> 会計
        </button>
        {canSales && (
          <button
            className={`nav-btn ${screen === 'sales' ? 'active' : ''}`}
            onClick={() => setScreen('sales')}
          >
            <i className="ti ti-chart-bar" aria-hidden /> 売上管理
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
        {screen === 'menu' && isOwner && <MenuManageScreen />}
        {screen === 'cast' && isOwner && <CastManageScreen />}
        {screen === 'punchmgr' && isOwner && <PunchManageScreen />}
      </main>
    </div>
  )
}
