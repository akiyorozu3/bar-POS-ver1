import { useEffect, useState } from 'react'
import { usePosStore, todayStr, dateStrOf, businessDayStart, businessDayEnd } from '@/store/posStore'
import type { Transaction, RecurringExpense } from '@/types'
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
// 一覧バッジ用：分割支払いは「分割」表示にまとめる
const txPayLabel = (t: Transaction) => (t.payments?.length ? '分割' : PAY_LABEL[t.payMethod])
const txPayCls = (t: Transaction) => (t.payments?.length ? 'method-split' : PAY_METHOD_CLS[t.payMethod])

// 滞在時間（ミリ秒 → 「2時間15分」）。0以下は空文字
function fmtDur(ms: number): string {
  if (!(ms > 0)) return ''
  const min = Math.round(ms / 60000)
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}時間${m}分` : `${m}分`
}

function periodRange(period: Period, entryDate: string): [Date, Date] {
  // 営業日は 17:00〜翌17:00。範囲は実時刻の [営業日開始, 終端) で表す。
  // entryDate（ヘッダーの営業日）を基準にする。
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(entryDate) ? entryDate : todayStr()
  // その営業日の終端（翌営業日の開始の直前ミリ秒）
  const to = new Date(businessDayEnd(dateStr).getTime() - 1)
  if (period === 'today') {
    return [businessDayStart(dateStr), to]
  }
  if (period === 'week') {
    const from = businessDayStart(dateStr)
    from.setDate(from.getDate() - 6) // 直近7営業日
    return [from, to]
  }
  // 今月：その営業日が属する月の1日（営業日）から
  const [y, m] = dateStr.split('-').map(Number)
  const from = businessDayStart(`${y}-${String(m).padStart(2, '0')}-01`)
  return [from, to]
}

export default function SalesScreen() {
  const { transactions, transactionsLoading, subscribeTransactions, feeSettings, saveFeeSettings, backRate, drinkBackRate, saveBackRate, taxRate, taxMode, saveTaxSettings, seats, orders, closedDates, closeDay, reopenDay, entryDate, casts, payouts, subscribePayouts, addPayout, deletePayout, deleteTransaction, restoreTransaction, role, expenses, recurringExpenses, subscribeExpenses, addExpense, deleteExpense, subscribeRecurringExpenses, addRecurringExpense, deleteRecurringExpense } = usePosStore()
  const isOwner = role === 'owner'
  const [period, setPeriod] = useState<Period>('today')
  const [showFeePanel, setShowFeePanel] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [showClosePanel, setShowClosePanel] = useState(false)
  const [showTxPanel, setShowTxPanel] = useState(false)
  const [viewTx, setViewTx] = useState<Transaction | null>(null)
  const [showPayoutPanel, setShowPayoutPanel] = useState(false)
  const [payoutCast, setPayoutCast] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutType, setPayoutType] = useState<'daily' | 'oiri'>('daily')
  // 経費
  const [showExpensePanel, setShowExpensePanel] = useState(false)
  const [expItem, setExpItem] = useState('')
  const [expAmount, setExpAmount] = useState('')      // 支出は正の数で入力（内部で−にする）
  const [expSign, setExpSign] = useState<'out' | 'in'>('out') // out=支出(−) / in=収入(＋)
  const [recItem, setRecItem] = useState('')
  const [recAmount, setRecAmount] = useState('')
  const [recSign, setRecSign] = useState<'out' | 'in'>('out')
  const [recCycle, setRecCycle] = useState<'monthly' | 'weekly'>('monthly')
  const [recDay, setRecDay] = useState('1')
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
    const u3 = subscribeExpenses(from, to)
    const u4 = subscribeRecurringExpenses()
    return () => { u1(); u2(); u3(); u4() }
  }, [period, entryDate, subscribeTransactions, subscribePayouts, subscribeExpenses, subscribeRecurringExpenses])

  const summary = useSalesSummary(transactions)

  // レジ締め（ヘッダーの入力日を対象にする）
  const closeDate = entryDate
  const dateClosed = closedDates.includes(closeDate)
  const isBackdated = closeDate !== todayStr()
  const unpaidCount = seats.filter((s) => (orders[s.id]?.length ?? 0) > 0).length
  const totalBack = summary.castSummaries.reduce((a, c) => a + c.backAmount, 0)

  // 日払い/大入（選択期間の分。payouts は購読範囲＝選択期間そのもの）
  const periodDailyPay = payouts.filter((p) => p.type === 'daily').reduce((a, p) => a + p.amount, 0)
  const periodOiri = payouts.filter((p) => p.type === 'oiri').reduce((a, p) => a + p.amount, 0)
  const periodPayoutTotal = periodDailyPay + periodOiri
  const periodLabel = { today: '今日', week: '今週', month: '今月' }[period]

  // 日払い/大入（ヘッダー日付の分。レジ締めは1営業日単位のため日別で使う）
  const dayPayouts = payouts.filter((p) => p.date === closeDate)
  const dailyPayTotal = dayPayouts.filter((p) => p.type === 'daily').reduce((a, p) => a + p.amount, 0)
  const oiriTotal = dayPayouts.filter((p) => p.type === 'oiri').reduce((a, p) => a + p.amount, 0)

  // 経費：金額は符号込み（＋収入 / −支出）。実際の入金合計に反映。
  const [pFrom, pTo] = periodRange(period, entryDate)
  const fromStr = dateStrOf(pFrom.getTime())
  const toStr = dateStrOf(pTo.getTime())
  const recurringOccurrences = (rec: RecurringExpense): number => {
    let count = 0
    const end = new Date(`${toStr}T12:00:00`)
    for (const d = new Date(`${fromStr}T12:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
      if (rec.cycle === 'monthly' ? d.getDate() === rec.day : d.getDay() === rec.day) count++
    }
    return count
  }
  const oneoffExpenseTotal = expenses.reduce((a, e) => a + e.amount, 0)
  const recurringExpenseTotal = recurringExpenses.reduce((a, r) => a + r.amount * recurringOccurrences(r), 0)
  const expenseTotal = oneoffExpenseTotal + recurringExpenseTotal   // 符号込み
  // 金庫現金：全て現金前提。ヘッダー日の単発経費＋その日に該当する固定費を反映。
  const dayOneoff = expenses.filter((e) => e.date === closeDate).reduce((a, e) => a + e.amount, 0)
  const closeD = new Date(`${closeDate}T12:00:00`)
  const dayRecurring = recurringExpenses.reduce((a, r) => {
    const hit = r.cycle === 'monthly' ? closeD.getDate() === r.day : closeD.getDay() === r.day
    return a + (hit ? r.amount : 0)
  }, 0)
  const dayExpense = dayOneoff + dayRecurring

  const safeCash = summary.byMethod.cash.sales - dailyPayTotal - oiriTotal + dayExpense
  // 実際の入金合計（実入金 − 日払い/大入 ＋ 経費符号込み）
  const netAfterAll = summary.totalNet - periodPayoutTotal + expenseTotal

  const handleAddPayout = async () => {
    const amt = Math.abs(parseInt(payoutAmount, 10))
    if (!payoutCast || !Number.isFinite(amt) || amt === 0) return
    await addPayout(payoutCast, payoutType, amt)
    setPayoutAmount('')
  }

  const handleAddExpense = async () => {
    const raw = Math.abs(parseInt(expAmount, 10))
    if (!expItem.trim() || !Number.isFinite(raw) || raw === 0) return
    const signed = expSign === 'out' ? -raw : raw
    await addExpense(expItem.trim(), signed)
    setExpItem(''); setExpAmount('')
  }

  const handleAddRecurring = async () => {
    const raw = Math.abs(parseInt(recAmount, 10))
    const day = parseInt(recDay, 10)
    if (!recItem.trim() || !Number.isFinite(raw) || raw === 0 || !Number.isFinite(day)) return
    const signed = recSign === 'out' ? -raw : raw
    await addRecurringExpense(recItem.trim(), signed, recCycle, day)
    setRecItem(''); setRecAmount('')
  }

  // 完了した会計の編集/削除
  const txClosed = (t: Transaction) => closedDates.includes(dateStrOf(t.completedAt))
  const handleEditTx = (t: Transaction) => {
    if (txClosed(t)) { alert(`${dateStrOf(t.completedAt)} は締め済みです。締め解除してから編集してください。`); return }
    if (!confirm('この会計を編集します。\n内容を注文画面に戻し、元の会計は削除します（会計し直すと再計算されます）。\nよろしいですか？')) return
    restoreTransaction(t)
    document.dispatchEvent(new CustomEvent('pos:go-order'))
  }
  const handleDeleteTx = async (t: Transaction) => {
    if (txClosed(t)) { alert(`${dateStrOf(t.completedAt)} は締め済みです。締め解除してから削除してください。`); return }
    if (!confirm(`${t.seatName} の会計（¥${t.total.toLocaleString()}）を削除します。よろしいですか？`)) return
    await deleteTransaction(t.id)
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
          className={`top-action-btn ${showTxPanel ? 'active-s' : ''}`}
          onClick={() => setShowTxPanel((v) => !v)}
        >
          <i className="ti ti-receipt" aria-hidden /> 取引明細
        </button>
        <button
          className={`top-action-btn ${showPayoutPanel ? 'active-s' : ''}`}
          onClick={() => { setPeriod('today'); setShowPayoutPanel((v) => !v) }}
        >
          <i className="ti ti-cash-banknote" aria-hidden /> 日払い/大入
        </button>
        {isOwner && (
          <button
            className={`top-action-btn ${showExpensePanel ? 'active-s' : ''}`}
            onClick={() => setShowExpensePanel((v) => !v)}
          >
            <i className="ti ti-notes" aria-hidden /> 経費
          </button>
        )}
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
        {/* 取引明細（完了した会計・オーナー） */}
        {showTxPanel && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-receipt" aria-hidden /> 取引明細（{transactions.length}件）
            </div>
            <div className="tx-list">
              {transactions.length === 0 ? (
                <div className="mm-empty" style={{ padding: 12 }}>この期間の会計はありません</div>
              ) : transactions.map((t) => (
                <div className={`tx-row ${txClosed(t) ? 'closed' : ''}`} key={t.id}>
                  <span className="tx-time">{new Date(t.completedAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="tx-seat">{t.seatName}</span>
                  <span className={`method ${txPayCls(t)}`}>{txPayLabel(t)}</span>
                  <span className="tx-total">¥{t.total.toLocaleString()}</span>
                  <span className="tx-actions">
                    <button className="tx-btn" onClick={() => setViewTx(t)}>閲覧</button>
                    <button className="tx-btn edit" onClick={() => handleEditTx(t)}>編集</button>
                    <button className="tx-btn del" onClick={() => handleDeleteTx(t)}>削除</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="mm-note" style={{ paddingTop: 6 }}>※ 締め済みの日の会計は、締め解除してから編集/削除できます。</div>
          </div>
        )}

        {/* 日払い/大入パネル */}
        {showPayoutPanel && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-cash-banknote" aria-hidden /> 日払い/大入（{periodLabel}）
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
            <div className="mm-note" style={{ padding: '0 2px 6px' }}>＋追加は {closeDate.replace(/-/g, '/')} に記録されます</div>
            {payouts.length === 0 ? (
              <div className="mm-empty" style={{ padding: 12 }}>{periodLabel}の日払い/大入はありません</div>
            ) : payouts.map((p) => (
              <div className="close-row" key={p.id}>
                <span>
                  <span className={`method ${p.type === 'daily' ? 'method-card' : 'method-qr'}`}>{p.type === 'daily' ? '日払い' : '大入'}</span>
                  {period !== 'today' && <span className="payout-date">{p.date.slice(5).replace('-', '/')}</span>}
                  {' '}{p.name || p.realName}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  ¥{p.amount.toLocaleString()}
                  <button className="mm-row-del" onClick={() => deletePayout(p.id)}>削除</button>
                </span>
              </div>
            ))}
            <div className="close-row total">
              <span>日払い ¥{periodDailyPay.toLocaleString()} ／ 大入 ¥{periodOiri.toLocaleString()}</span>
              <span className="fee-amt">−¥{periodPayoutTotal.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* 経費パネル（オーナー） */}
        {showExpensePanel && isOwner && (
          <div className="fee-settings">
            <div className="fee-settings-title">
              <i className="ti ti-notes" aria-hidden /> 経費（{periodLabel}）
            </div>

            {/* 単発の経費 */}
            <div className="mm-add-row" style={{ marginBottom: 6 }}>
              <input className="mm-add-name" placeholder="品目（例：おしぼり代）" value={expItem} onChange={(e) => setExpItem(e.target.value)} />
              <select className="mm-add-cat" value={expSign} onChange={(e) => setExpSign(e.target.value as 'out' | 'in')}>
                <option value="out">支出 −</option>
                <option value="in">収入 ＋</option>
              </select>
              <input className="mm-add-price" type="number" min="0" placeholder="金額" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
              <button className="mm-add-btn" onClick={handleAddExpense} disabled={!expItem.trim() || !expAmount}>＋ 追加</button>
            </div>
            <div className="mm-note" style={{ padding: '0 2px 6px' }}>全て現金前提です（実際の入金合計と金庫現金の両方に反映）。＋追加は {closeDate.replace(/-/g, '/')} に記録されます</div>
            {expenses.length === 0 ? (
              <div className="mm-empty" style={{ padding: 10 }}>{periodLabel}の経費はありません</div>
            ) : expenses.map((e) => (
              <div className="close-row" key={e.id}>
                <span>
                  {period !== 'today' && <span className="payout-date">{e.date.slice(5).replace('-', '/')}</span>}
                  {e.item}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={e.amount < 0 ? 'fee-amt' : 'net-amt'}>{e.amount < 0 ? '−' : '＋'}¥{Math.abs(e.amount).toLocaleString()}</span>
                  <button className="mm-row-del" onClick={() => deleteExpense(e.id)}>削除</button>
                </span>
              </div>
            ))}

            {/* 固定費（定期） */}
            <div className="fee-settings-title" style={{ marginTop: 12 }}>
              <i className="ti ti-repeat" aria-hidden /> 固定費（定期）
            </div>
            <div className="mm-note" style={{ padding: '0 2px 6px' }}>登録すると毎月/毎週その分が自動で反映されます（該当日はレジの金庫現金からも控除）。</div>
            <div className="mm-add-row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
              <input className="mm-add-name" placeholder="品目（例：家賃）" value={recItem} onChange={(e) => setRecItem(e.target.value)} />
              <select className="mm-add-cat" value={recSign} onChange={(e) => setRecSign(e.target.value as 'out' | 'in')}>
                <option value="out">支出 −</option>
                <option value="in">収入 ＋</option>
              </select>
              <input className="mm-add-price" type="number" min="0" placeholder="金額" value={recAmount} onChange={(e) => setRecAmount(e.target.value)} />
              <select className="mm-add-cat" value={recCycle} onChange={(e) => setRecCycle(e.target.value as 'monthly' | 'weekly')}>
                <option value="monthly">毎月</option>
                <option value="weekly">毎週</option>
              </select>
              {recCycle === 'monthly' ? (
                <span className="rec-day-wrap"><input className="rec-day-input" type="number" min="1" max="31" value={recDay} onChange={(e) => setRecDay(e.target.value)} />日</span>
              ) : (
                <select className="mm-add-cat" value={recDay} onChange={(e) => setRecDay(e.target.value)}>
                  {['日', '月', '火', '水', '木', '金', '土'].map((w, i) => <option key={i} value={String(i)}>{w}曜</option>)}
                </select>
              )}
              <button className="mm-add-btn" onClick={handleAddRecurring} disabled={!recItem.trim() || !recAmount}>＋ 追加</button>
            </div>
            {recurringExpenses.map((r) => (
              <div className="close-row" key={r.id}>
                <span>
                  {r.item}
                  <span className="payout-date">{r.cycle === 'monthly' ? `毎月${r.day}日` : `毎週${['日', '月', '火', '水', '木', '金', '土'][r.day]}曜`}</span>
                  <span className="exp-tag">{periodLabel}{recurringOccurrences(r)}回</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={r.amount < 0 ? 'fee-amt' : 'net-amt'}>{r.amount < 0 ? '−' : '＋'}¥{Math.abs(r.amount).toLocaleString()}</span>
                  <button className="mm-row-del" onClick={() => deleteRecurringExpense(r.id)}>削除</button>
                </span>
              </div>
            ))}

            <div className="close-row total" style={{ marginTop: 8 }}>
              <span>経費合計（{periodLabel}・実際の入金合計に反映）</span>
              <span className={expenseTotal < 0 ? 'fee-amt' : 'net-amt'}>{expenseTotal < 0 ? '−' : '＋'}¥{Math.abs(expenseTotal).toLocaleString()}</span>
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
                {dayExpense !== 0 && (
                  <div className="close-row"><span>経費（固定費含む）</span><span className={dayExpense < 0 ? 'fee-amt' : 'net-amt'}>{dayExpense < 0 ? '−' : '＋'}¥{Math.abs(dayExpense).toLocaleString()}</span></div>
                )}
                <div className="close-row total"><span>金庫に残る現金（現金 − 日払い − 大入{dayExpense !== 0 ? ' ± 経費' : ''}）</span><span>¥{safeCash.toLocaleString()}</span></div>
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
            <div className="stat-val">¥{netAfterAll.toLocaleString()}</div>
            <div className="stat-sub">
              {(() => {
                const parts = [`一人客 ${summary.soloCount}件`]
                if (periodPayoutTotal > 0) parts.push(`日払い・大入 −¥${periodPayoutTotal.toLocaleString()}`)
                if (expenseTotal !== 0) parts.push(`経費 ${expenseTotal < 0 ? '−' : '＋'}¥${Math.abs(expenseTotal).toLocaleString()}`)
                return parts.join(' ／ ')
              })()}
            </div>
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

      {viewTx && (
        <div className="modal-overlay" onClick={() => setViewTx(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {viewTx.seatName}（{new Date(viewTx.completedAt).toLocaleString('ja-JP')}）
            </div>
            {viewTx.openedAt != null && (
              <div className="tx-view-time">
                <i className="ti ti-clock-play" aria-hidden /> 立ち上げ {new Date(viewTx.openedAt).toLocaleString('ja-JP')}
                {fmtDur(viewTx.completedAt - viewTx.openedAt) && <span className="tx-view-dur">／ 滞在 {fmtDur(viewTx.completedAt - viewTx.openedAt)}</span>}
              </div>
            )}
            <div className="tx-view-list">
              {viewTx.items.map((x) => (
                <div key={x.id} className="co-row">
                  <span className="co-row-name">{x.name} × {x.qty}</span>
                  <span className="co-row-cast">{x.cast}</span>
                  <span className={`co-row-price ${x.priceExTax < 0 ? 'minus' : ''}`}>¥{(x.priceExTax * x.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="close-row"><span>小計</span><span>¥{viewTx.subtotal.toLocaleString()}</span></div>
            {viewTx.tax > 0 && <div className="close-row"><span>消費税</span><span>¥{viewTx.tax.toLocaleString()}</span></div>}
            <div className="close-row total"><span>合計（{txPayLabel(viewTx)}）</span><span>¥{viewTx.total.toLocaleString()}</span></div>
            {viewTx.payments?.length ? (
              <>
                {viewTx.payments.map((p, i) => (
                  <div className="close-row" key={i}>
                    <span>{PAY_LABEL[p.method]}{p.feeRate > 0 ? `（手数料${p.feeRate}%）` : ''}</span>
                    <span>¥{p.amount.toLocaleString()}{p.feeAmount > 0 ? ` → ¥${(p.amount - p.feeAmount).toLocaleString()}` : ''}</span>
                  </div>
                ))}
                {viewTx.feeAmount > 0 && (
                  <div className="close-row"><span>手数料合計</span><span className="fee-amt">−¥{viewTx.feeAmount.toLocaleString()}</span></div>
                )}
                <div className="close-row"><span>実入金額</span><span className="net-amt">¥{viewTx.netAmount.toLocaleString()}</span></div>
              </>
            ) : viewTx.feeAmount > 0 ? (
              <>
                <div className="close-row"><span>決済手数料（{viewTx.feeRate}%）</span><span className="fee-amt">−¥{viewTx.feeAmount.toLocaleString()}</span></div>
                <div className="close-row"><span>実入金額</span><span className="net-amt">¥{viewTx.netAmount.toLocaleString()}</span></div>
              </>
            ) : null}
            {viewTx.tableCasts?.length > 0 && (
              <div className="close-row"><span>卓の担当</span><span>{viewTx.tableCasts.join('・')}</span></div>
            )}
            <div className="modal-btns" style={{ marginTop: 10 }}>
              <button className="modal-btn ok" onClick={() => setViewTx(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
