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
  const backdated = entryDate !== todayStr()

  // 認証状態の購読（初回マウント時）
  useEffect(() => {
    const unsub = initAuth()
    return unsub
  }, [initAuth])

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
    if (!isOwner && (screen === 'sales' || screen === 'menu' || screen === 'cast' || screen === 'punchmgr')) setScreen('order')
  }, [isOwner, screen])

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
      {IS_TEST_ENV && <TestEnvBanner />}
      {/* トップバー（ユーザー情報・ログアウト） */}
      <div className={`topbar ${backdated ? 'backdated' : ''}`}>
        <span className="topbar-role">
          {isOwner ? 'オーナー' : 'スタッフ'}
        </span>
        <label className="topbar-date">
          <span className="topbar-date-lbl">{backdated ? '遡及入力 ⚠' : '日付'}</span>
          <input
            type="date"
            value={entryDate}
            max={todayStr()}
            onChange={(e) => setEntryDate(e.target.value)}
          />
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
        {isOwner && (
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
        {screen === 'sales' && isOwner && <SalesScreen />}
        {screen === 'menu' && isOwner && <MenuManageScreen />}
        {screen === 'cast' && isOwner && <CastManageScreen />}
        {screen === 'punchmgr' && isOwner && <PunchManageScreen />}
      </main>
    </div>
  )
}
