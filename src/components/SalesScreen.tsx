import { useEffect, useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { useSalesSummary } from '@/hooks/useSalesSummary'
import { buildTransactionCSV, buildCastCSV, downloadCSV } from '@/lib/csv'
import type { PayMethod } from '@/types'

type Period = 'today' | 'week' | 'month'

const PAY_LABEL: Record<PayMethod, string> = { cash: '現金', card: 'カード', qr: 'QR払い' }
const PAY_COLOR: Record<PayMethod, string> = { cash: '#1D9E75', card: '#378ADD', qr: '#BA7517' }
const PAY_METHOD_CLS: Record<PayMethod, string> = {
  cash: 'method-cash', card: 'method-card', qr: 'method-qr',
}

function periodRange(period: Period): [Date, Date] {
  const now = new Date()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  if (period === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return [from, to]
  }
  if (period === 'week') {
    const from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0,0,0,0)
    return [from, to]
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return [from, to]
}

export default function SalesScreen() {
  const { transactions, transactionsLoading, subscribeTransactions, feeSettings, saveFeeSettings } = usePosStore()
  const [period, setPeriod] = useState<Period>('today')
  const [showFeePanel, setShowFeePanel] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [cardFee, setCardFee] = useState(String(feeSettings.card))
  const [qrFee, setQrFee] = useState(String(feeSettings.qr))

  // 期間が変わるたびに購読し直す
  useEffect(() => {
    const [from, to] = periodRange(period)
    const unsub = subscribeTransactions(from, to)
    return unsub
  }, [period, subscribeTransactions])

  const summary = useSalesSummary(transactions)

  const handleSaveFee = async () => {
    await saveFeeSettings({ card: parseFloat(cardFee) || 0, qr: parseFloat(qrFee) || 0 })
  }

  const handleExportTx = () => {
    const csv = buildTransactionCSV(transactions)
    const label = { today: '今日', week: '今週', month: '今月' }[period]
    downloadCSV(csv, `売上_${label}_${new Date().toLocaleDateString('ja-JP').replace(/\//g,'')}.csv`)
  }

  const handleExportCast = () => {
    const csv = buildCastCSV(summary)
    downloadCSV(csv, `キャストバック_${new Date().toLocaleDateString('ja-JP').replace(/\//g,'')}.csv`)
  }

  if (transactionsLoading) return <div className="loading">読み込み中...</div>

  return (
    <div className="sales-screen">
      <div className="sales-top">
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <button key={p} className={`period-btn ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
            {{ today: '今日', week: '今週', month: '今月' }[p]}
          </button>
        ))}
        <button className={`top-action-btn ${showFeePanel ? 'active-s' : ''}`} onClick={() => setShowFeePanel((v) => !v)}>
          <i className="ti ti-settings" aria-hidden /> 手数料
        </button>
        <button className={`top-action-btn ${showSyncPanel ? 'active-s' : ''}`} onClick={() => setShowSyncPanel((v) => !v)}>
          <i className="ti ti-cloud" aria-hidden /> 連携
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="export-btn" onClick={handleExportTx}>
            <i className="ti ti-download" aria-hidden /> 売上CSV
          </button>
          <button className="export-btn" onClick={handleExportCast}>
            <i className="ti ti-download" aria-hidden /> バックCSV
          </button>
        </div>
      </div>

      <div className="sales-body">
        {/* 手数料設定パネル */}
        {showFeePanel && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-settings" aria-hidden /> 決済手数料率の設定
            </div>
            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-credit-card" aria-hidden /> カード</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="10" step="0.01"
                  value={cardFee} onChange={(e) => setCardFee(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>
            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-device-mobile" aria-hidden /> QR払い</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="10" step="0.01"
                  value={qrFee} onChange={(e) => setQrFee(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>
            <button className="modal-btn ok" style={{ marginTop: 6 }} onClick={handleSaveFee}>
              保存
            </button>
          </div>
        )}

        {/* Firebase連携説明 */}
        {showSyncPanel && (
          <div className="sync-info">
            <div className="sync-info-title">
              <i className="ti ti-cloud" aria-hidden /> データ連携
              <span className="sync-badge"><span className="sync-dot" />リアルタイム同期</span>
            </div>
            <p className="sync-info-body">
              iPadで支払いを確定するたびに Firebase Firestore へ自動保存されます。<br />
              オーナーはパソコンで同じURLを開くだけで最新の売上を確認できます。<br />
              「CSV出力」から Excel に取り込めるファイルをダウンロードできます。
            </p>
          </div>
        )}

        {/* サマリーカード */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-lbl">売上合計</div>
            <div className="stat-val">¥{summary.totalSales.toLocaleString()}</div>
            <div className="stat-sub">{summary.txCount}件 / 客単価 ¥{summary.avgPerCustomer.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-lbl">決済手数料</div>
            <div className="stat-val danger">−¥{summary.totalFee.toLocaleString()}</div>
          </div>
          <div className="stat-card hl">
            <div className="stat-lbl">実際の入金合計</div>
            <div className="stat-val">¥{summary.totalNet.toLocaleString()}</div>
            <div className="stat-sub">一人客 {summary.soloCount}件</div>
          </div>
        </div>

        {/* 支払い方法別 実入金 */}
        <div>
          <div className="section-title">支払い方法別 実入金</div>
          <div className="net-table">
            <div className="net-head">
              <span>方法</span><span>件数</span><span>売上</span><span>手数料</span><span>実入金</span>
            </div>
            {(['cash', 'card', 'qr'] as PayMethod[]).map((m) => {
              const d = summary.byMethod[m]
              return (
                <div key={m} className="net-row">
                  <span><span className={`method ${PAY_METHOD_CLS[m]}`}>{PAY_LABEL[m]}</span></span>
                  <span>{d.count}件</span>
                  <span>¥{d.sales.toLocaleString()}</span>
                  {d.fee > 0
                    ? <span className="fee-amt">−¥{d.fee.toLocaleString()}</span>
                    : <span className="muted">なし</span>}
                  <span className="net-amt">¥{d.net.toLocaleString()}</span>
                </div>
              )
            })}
            <div className="net-total-row">
              <span>合計</span><span>{summary.txCount}件</span>
              <span>¥{summary.totalSales.toLocaleString()}</span>
              <span className="fee-amt">−¥{summary.totalFee.toLocaleString()}</span>
              <span className="net-amt">¥{summary.totalNet.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 支払い方法の割合 */}
        <div>
          <div className="section-title">支払い方法の割合</div>
          <div className="pay-bar-wrap">
            {(['cash', 'card', 'qr'] as PayMethod[]).map((m) => {
              const pct = summary.totalSales > 0
                ? Math.round(summary.byMethod[m].sales / summary.totalSales * 100)
                : 0
              return (
                <div key={m} className="bar-row">
                  <span className="bar-lbl">{PAY_LABEL[m]}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: PAY_COLOR[m] }} />
                  </div>
                  <span className="bar-val">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* キャストバック集計 */}
        <div>
          <div className="section-title">キャストバック集計</div>
          <div className="cast-table">
            <div className="cast-head">
              <span>キャスト</span><span>件数</span><span>売上</span><span>バック</span>
            </div>
            {summary.castSummaries.map((c) => (
              <div key={c.name} className="cast-row-item">
                <span>{c.name}</span>
                <span>{c.txCount}件</span>
                <span>¥{c.salesAmount.toLocaleString()}</span>
                <span className="back-badge">¥{c.backAmount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
