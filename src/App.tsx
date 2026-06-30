import { useEffect, useState } from 'react'
import { usePosStore } from '@/store/posStore'
import OrderScreen from '@/components/OrderScreen'
import CheckoutScreen from '@/components/CheckoutScreen'
import SalesScreen from '@/components/SalesScreen'
import MenuManageScreen from '@/components/MenuManageScreen'
import CastManageScreen from '@/components/CastManageScreen'
import LoginScreen from '@/components/LoginScreen'

type Screen = 'order' | 'checkout' | 'sales' | 'menu' | 'cast'

const readScreen = (): Screen => {
  try { return (localStorage.getItem('pos:screen') as Screen) || 'order' } catch { return 'order' }
}

export default function App() {
  const [screen, setScreenRaw] = useState<Screen>(readScreen)
  const setScreen = (s: Screen) => {
    setScreenRaw(s)
    try { localStorage.setItem('pos:screen', s) } catch { /* ignore */ }
  }
  const {
    user, role, authReady,
    initAuth, signOutUser,
    subscribeMenus, subscribeCasts, subscribeTables, loadFeeSettings, loadBackRate, loadCategoryRates, loadTaxSettings,
  } = usePosStore()

  const isOwner = role === 'owner'

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
    loadFeeSettings()
    loadBackRate()
    loadCategoryRates()
    loadTaxSettings()
    return () => { unsubMenus(); unsubCasts(); unsubTables() }
  }, [user, subscribeMenus, subscribeCasts, subscribeTables, loadFeeSettings, loadBackRate, loadCategoryRates, loadTaxSettings])

  // 権限が変わったら、許可されない画面からは注文入力に戻す
  useEffect(() => {
    if (!isOwner && (screen === 'sales' || screen === 'menu' || screen === 'cast')) setScreen('order')
  }, [isOwner, screen])

  // 会計へ遷移イベント（OrderScreen から発火）
  useEffect(() => {
    const handler = () => setScreen('checkout')
    document.addEventListener('pos:go-checkout', handler)
    return () => document.removeEventListener('pos:go-checkout', handler)
  }, [])

  // 認証確認中
  if (!authReady) return <div className="app"><div className="loading">読み込み中...</div></div>

  // 未ログイン
  if (!user) return <LoginScreen />

  return (
    <div className="app">
      {/* トップバー（ユーザー情報・ログアウト） */}
      <div className="topbar">
        <span className="topbar-role">
          {isOwner ? 'オーナー' : 'スタッフ'}
        </span>
        <button className="logout-btn" onClick={signOutUser}>
          <i className="ti ti-logout" aria-hidden /> ログアウト
        </button>
      </div>

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
      </main>
    </div>
  )
}
