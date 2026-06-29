import { useEffect, useState } from 'react'
import { usePosStore } from '@/store/posStore'
import OrderScreen from '@/components/OrderScreen'
import CheckoutScreen from '@/components/CheckoutScreen'
import SalesScreen from '@/components/SalesScreen'

type Screen = 'order' | 'checkout' | 'sales'

export default function App() {
  const [screen, setScreen] = useState<Screen>('order')
  const { subscribeMenus, loadFeeSettings, currentSeatId, orders } = usePosStore()

  useEffect(() => {
    const unsub = subscribeMenus()
    loadFeeSettings()
    return unsub
  }, [subscribeMenus, loadFeeSettings])

  useEffect(() => {
    const handler = () => {
      const items = currentSeatId ? (orders[currentSeatId] ?? []) : []
      if (items.length > 0) setScreen('checkout')
    }
    document.addEventListener('pos:go-checkout', handler)
    return () => document.removeEventListener('pos:go-checkout', handler)
  }, [currentSeatId, orders])

  return (
    <div className="app">
      <nav className="nav">
        <button className={`nav-btn ${screen === 'order' ? 'active' : ''}`} onClick={() => setScreen('order')}>
          <i className="ti ti-pencil" aria-hidden /> 注文入力
        </button>
        <button className={`nav-btn ${screen === 'checkout' ? 'active' : ''}`} onClick={() => {
          const items = currentSeatId ? (orders[currentSeatId] ?? []) : []
          if (items.length > 0) setScreen('checkout')
        }}>
          <i className="ti ti-receipt" aria-hidden /> 会計
        </button>
        <button className={`nav-btn ${screen === 'sales' ? 'active' : ''}`} onClick={() => setScreen('sales')}>
          <i className="ti ti-chart-bar" aria-hidden /> 売上管理
        </button>
      </nav>
      <main className="main">
        {screen === 'order' && <OrderScreen />}
        {screen === 'checkout' && <CheckoutScreen onBack={() => setScreen('order')} />}
        {screen === 'sales' && <SalesScreen />}
      </main>
    </div>
  )
}