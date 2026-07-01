import { useEffect, useState } from 'react'
import { usePosStore, todayStr } from '@/store/posStore'
import { useSalesSummary } from '@/hooks/useSalesSummary'
import { buildTransactionCSV, buildCastCSV, downloadCSV } from '@/lib/csv'
import { castLabel } from '@/lib/cast'
import type { PayMethod } from '@/types'

type Period = 'today' | 'week' | 'month'

const PAY_LABEL: Record<PayMethod, string> = { cash: '現金', card: 'カード', qr: 'QR払い' }
const PAY_COLOR: Record<PayMethod, string> = { cash: '#1D9E75', card: '#378ADD', qr: '#BA7517' }
const PAY_METHOD_CLS: Record<PayMethod, string> = {
  cash: 'method-cash', card: 'method-card', qr: 'method-qr',
}

function periodRange(period: Period, entryDate: string): [Date, Date] {
  // 今日・今週はヘッダーの入力日を基準にする（今月は実際の今日基準のまま）
  const ref = new Date(`${entryDate}T00:00:00`)
  const base = isNaN(ref.getTime()) ? new Date() : ref
  if (period === 'today') {
    const from = new Date(base.getFullYear(), base.getMonth(), base.getDate())
    const to = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999)
    return [from, to]
  }
  if (period === 'week') {
    const to = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999)
    const from = new Date(base); from.setDate(base.getDate() - 6); from.setHours(0, 0, 0, 0)
    return [from, to]
  }
  // 今月：実際の今日基準（そのまま）
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return [from, to]
}

export default function SalesScreen() {
  const { transactions, transactionsLoading, subscribeTransactions, feeSettings, saveFeeSettings, backRate, drinkBackRate, saveBackRate, taxRate, taxMode, saveTaxSettings, seats, orders, closedDates, closeDay, reopenDay, entryDate, casts, payouts, subscribePayouts, addPayout, deletePayout } = usePosStore()
  const [period, setPeriod] = useState<Period>('today')
  const [showFeePanel, setShowFeePanel] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [showClosePanel, setShowClosePanel] = useState(false)
  const [showPayoutPanel, setShowPayoutPanel] = useState(false)
  const [payoutCast, setPayoutCast] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutType, setPayoutType] = useState<'daily' | 'oiri'>('daily')
  const [closing, setClosing] = useState(false)
  const [cardFee, setCardFee] = useState(String(feeSettings.card))
  const [qrFee, setQrFee] = useState(String(feeSettings.qr))
  const [backPct, setBackPct] = useState(String(Math.round(backRate * 100)))
  const [drinkPct, setDrinkPct] = useState(String(Math.round(drinkBackRate * 100)))
  const [taxPct, setTaxPct] = useState(String(Math.round(taxRate * 100)))
  const [taxModeLocal, setTaxModeLocal] = useState(taxMode)
  const [feeSaved, setFeeSaved] = useState(false)

  // 期間・入力日が変わるたびに購読し直す
  useEffect(() => {
    const [from, to] = periodRange(period, entryDate)
    const u1 = subscribeTransactions(from, to)
    const u2 = subscribePayouts(from, to)
    return () => { u1(); u2() }
  }, [period, entryDate, subscribeTransactions, subscribePayouts])

  const summary = useSalesSummary(transactions)

  // レジ締め（ヘッダーの入力日を対象にする）
  const closeDate = entryDate
  const dateClosed = closedDates.includes(closeDate)
  const isBackdated = closeDate !== todayStr()
  const unpaidCount = seats.filter((s) => (orders[s.id]?.length ?? 0) > 0).length
  const totalBack = summary.castSummaries.reduce((a, c) => a + c.backAmount, 0)

  // 日払い/大入（ヘッダー日付の分）
  const dayPayouts = payouts.filter((p) => p.date === closeDate)
  const dailyPayTotal = dayPayouts.filter((p) => p.type === 'daily').reduce((a, p) => a + p.amount, 0)
  const oiriTotal = dayPayouts.filter((p) => p.type === 'oiri').reduce((a, p) => a + p.amount, 0)
  const safeCash = summary.byMethod.cash.sales - dailyPayTotal - oiriTotal

  const handleAddPayout = async () => {
    const amt = Math.abs(parseInt(payoutAmount, 10))
    if (!payoutCast || !Number.isFinite(amt) || amt === 0) return
    await addPayout(payoutCast, payoutType, amt)
    setPayoutAmount('')
  }

  const handleClose = async () => {
    if (!confirm(`${closeDate} を締めますか？\n締め後はこの日の会計入力ができなくなります（締め解除で戻せます）。`)) return
    setClosing(true)
    try {
      await closeDay({
        totalSales: summary.totalSales,
        cash: summary.byMethod.cash.sales,
        card: summary.byMethod.card.sales,
        qr: summary.byMethod.qr.sales,
        totalFee: summary.totalFee,
        totalNet: summary.totalNet,
        totalBack,
        txCount: summary.txCount,
        dailyPay: dailyPayTotal,
        oiri: oiriTotal,
      })
    } catch (e) {
      alert('レジ締めに失敗しました。\n' + ((e as Error)?.message ?? e))
    } finally { setClosing(false) }
  }

  const handleReopen = async () => {
    if (!confirm(`${closeDate} の締めを解除しますか？`)) return
    setClosing(true)
    try { await reopenDay(closeDate) }
    catch (e) { alert('解除に失敗しました。\n' + ((e as Error)?.message ?? e)) }
    finally { setClosing(false) }
  }

  // 設定が非同期で読み込まれたら入力欄に反映
  useEffect(() => { setBackPct(String(Math.round(backRate * 100))) }, [backRate])
  useEffect(() => { setDrinkPct(String(Math.round(drinkBackRate * 100))) }, [drinkBackRate])
  useEffect(() => { setCardFee(String(feeSettings.card)); setQrFee(String(feeSettings.qr)) }, [feeSettings])
  useEffect(() => { setTaxPct(String(Math.round(taxRate * 100))) }, [taxRate])
  useEffect(() => { setTaxModeLocal(taxMode) }, [taxMode])

  const handleSaveFee = async () => {
    const pct = Math.min(100, Math.max(0, parseFloat(backPct) || 0))
    const dPct = Math.min(100, Math.max(0, parseFloat(drinkPct) || 0))
    const tPct = Math.min(100, Math.max(0, parseFloat(taxPct) || 0))
    await Promise.all([
      saveFeeSettings({ card: parseFloat(cardFee) || 0, qr: parseFloat(qrFee) || 0 }),
      saveBackRate(pct / 100, dPct / 100),
      saveTaxSettings({ rate: tPct / 100, mode: taxModeLocal }),
    ])
    setFeeSaved(true)
    setTimeout(() => setFeeSaved(false), 2000)
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
          <i className="ti ti-settings" aria-hidden /> 手数料/バック
        </button>
        <button className={`top-action-btn ${showSyncPanel ? 'active-s' : ''}`} onClick={() => setShowSyncPanel((v) => !v)}>
          <i className="ti ti-cloud" aria-hidden /> 連携
        </button>
        <button
          className={`top-action-btn ${showPayoutPanel ? 'active-s' : ''}`}
          onClick={() => { setPeriod('today'); setShowPayoutPanel((v) => !v) }}
        >
          <i className="ti ti-cash-banknote" aria-hidden /> 日払い/大入
        </button>
        <button
          className={`top-action-btn ${showClosePanel ? 'active-s' : ''} ${dateClosed ? 'closed' : ''}`}
          onClick={() => { setPeriod('today'); setShowClosePanel((v) => !v) }}
        >
          <i className="ti ti-lock" aria-hidden /> レジ締め{dateClosed ? '済' : ''}
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
        {/* 日払い/大入パネル */}
        {showPayoutPanel && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-cash-banknote" aria-hidden /> 日払い/大入（{closeDate.replace(/-/g, '/')}）
            </div>
            <div className="mm-add-row" style={{ marginBottom: 8 }}>
              <select className="mm-add-cat" value={payoutType} onChange={(e) => setPayoutType(e.target.value as 'daily' | 'oiri')}>
                <option value="daily">日払い</option>
                <option value="oiri">大入</option>
              </select>
              <select className="mm-add-name" value={payoutCast} onChange={(e) => setPayoutCast(e.target.value)}>
                <option value="">キャスト</option>
                {casts.map((c) => <option key={c.id} value={c.id}>{castLabel(c)}</option>)}
              </select>
              <input className="mm-add-price" type="number" min="0" placeholder="金額" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
              <button className="mm-add-btn" onClick={handleAddPayout} disabled={!payoutCast || !payoutAmount}>＋ 追加</button>
            </div>
            {dayPayouts.length === 0 ? (
              <div className="mm-empty" style={{ padding: 12 }}>この日の日払い/大入はありません</div>
            ) : dayPayouts.map((p) => (
              <div className="close-row" key={p.id}>
                <span>
                  <span className={`method ${p.type === 'daily' ? 'method-card' : 'method-qr'}`}>{p.type === 'daily' ? '日払い' : '大入'}</span>
                  {' '}{p.name || p.realName}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  ¥{p.amount.toLocaleString()}
                  <button className="mm-row-del" onClick={() => deletePayout(p.id)}>削除</button>
                </span>
              </div>
            ))}
            <div className="close-row total">
              <span>日払い ¥{dailyPayTotal.toLocaleString()} ／ 大入 ¥{oiriTotal.toLocaleString()}</span>
              <span className="fee-amt">−¥{(dailyPayTotal + oiriTotal).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* レジ締めパネル */}
        {showClosePanel && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-lock" aria-hidden /> レジ締め（{closeDate.replace(/-/g, '/')}{isBackdated ? '・遡及' : ''}）
            </div>
            {dateClosed ? (
              <>
                <div className="close-done">{closeDate} は締め済みです。この日の会計入力はできません。</div>
                <button className="modal-btn" style={{ marginTop: 8 }} onClick={handleReopen} disabled={closing}>
                  締め解除（再び入力可能にする）
                </button>
              </>
            ) : (
              <>
                {unpaidCount > 0 && (
                  <div className="close-warn">⚠ 未会計の卓が {unpaidCount} 卓あります。締めるとこの売上は集計に入りません。</div>
                )}
                <div className="close-row"><span>現金</span><span>¥{summary.byMethod.cash.sales.toLocaleString()}</span></div>
                <div className="close-row"><span>カード</span><span>¥{summary.byMethod.card.sales.toLocaleString()}</span></div>
                <div className="close-row"><span>QR払い</span><span>¥{summary.byMethod.qr.sales.toLocaleString()}</span></div>
                <div className="close-row total"><span>売上合計（{summary.txCount}件）</span><span>¥{summary.totalSales.toLocaleString()}</span></div>
                <div className="close-row"><span>決済手数料</span><span className="fee-amt">−¥{summary.totalFee.toLocaleString()}</span></div>
                <div className="close-row"><span>実際の入金合計</span><span className="net-amt">¥{summary.totalNet.toLocaleString()}</span></div>
                <div className="close-row"><span>バック合計</span><span className="back-badge">¥{totalBack.toLocaleString()}</span></div>
                {(dailyPayTotal > 0 || oiriTotal > 0) && (
                  <>
                    <div className="close-row"><span>日払い</span><span className="fee-amt">−¥{dailyPayTotal.toLocaleString()}</span></div>
                    <div className="close-row"><span>大入</span><span className="fee-amt">−¥{oiriTotal.toLocaleString()}</span></div>
                  </>
                )}
                <div className="close-row total"><span>金庫に残る現金（現金 − 日払い − 大入）</span><span>¥{safeCash.toLocaleString()}</span></div>
                <button className="modal-btn ok" style={{ marginTop: 8, width: '100%' }} onClick={handleClose} disabled={closing}>
                  {closeDate.replace(/-/g, '/')} を締める
                </button>
              </>
            )}
          </div>
        )}

        {/* 手数料設定パネル */}
        {showFeePanel && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-settings" aria-hidden /> 手数料・バック率・消費税の設定
            </div>

            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-receipt-tax" aria-hidden /> 価格・消費税の扱い</span>
              <select className="tax-mode-sel" value={taxModeLocal}
                onChange={(e) => setTaxModeLocal(e.target.value as typeof taxModeLocal)}>
                <option value="inclusive">税込で登録・加算しない</option>
                <option value="exclusive">税抜で登録・会計時に加算</option>
              </select>
            </div>
            <div className="fee-row">
              <span className="fee-row-lbl">消費税率{taxModeLocal === 'inclusive' ? '（税抜時のみ使用）' : ''}</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="100" step="1"
                  value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>

            <div className="cat-rate-title">決済手数料・バック率</div>
            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-credit-card" aria-hidden /> カード手数料</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="10" step="0.01"
                  value={cardFee} onChange={(e) => setCardFee(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>
            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-device-mobile" aria-hidden /> QR払い手数料</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="10" step="0.01"
                  value={qrFee} onChange={(e) => setQrFee(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>
            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-coin" aria-hidden /> 卓バック率（合計に対して）</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="100" step="1"
                  value={backPct} onChange={(e) => setBackPct(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>
            <div className="fee-row">
              <span className="fee-row-lbl"><i className="ti ti-glass-cocktail" aria-hidden /> キャストドリンクバック率</span>
              <div className="fee-input-wrap">
                <input className="fee-input" type="number" min="0" max="100" step="1"
                  value={drinkPct} onChange={(e) => setDrinkPct(e.target.value)} />
                <span className="fee-pct">%</span>
              </div>
            </div>
            <div className="cat-rate-title" style={{ borderTop: 'none', paddingTop: 0 }}>
              卓バック＝合計×卓バック率を卓の担当で頭割り／キャストドリンクは料金×ドリンクバック率をその担当へ上乗せ
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <button className="modal-btn ok" onClick={handleSaveFee}>保存</button>
              {feeSaved && <span style={{ fontSize: 11, color: '#3b6d11' }}>保存しました ✓</span>}
            </div>
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
              <span>キャスト</span><span>卓数</span><span>売上</span><span>バック</span>
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
