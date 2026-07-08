import { useState, useEffect } from 'react'
import { usePosStore } from '@/store/posStore'
import { calcBill, calcFee } from '@/lib/tax'
import type { PayMethod } from '@/types'

const PAY_DEFS: { k: PayMethod; label: string; icon: string }[] = [
  { k: 'cash', label: '現金',    icon: 'ti-cash' },
  { k: 'card', label: 'カード',  icon: 'ti-credit-card' },
  { k: 'qr',   label: 'QR払い', icon: 'ti-device-mobile' },
]

const CASH_PRESETS = [1000, 2000, 5000, 10000]

interface Props {
  onBack: () => void
}

export default function CheckoutScreen({ onBack }: Props) {
  const { seats, currentSeatId, orders, feeSettings, completePayment, setCurrentSeat, role, taxRate, taxMode, entryDate, closedDates } = usePosStore()
  const isOwner = role === 'owner'
  const dayClosed = closedDates.includes(entryDate)
  const taxIncluded = taxMode === 'inclusive'
  const taxPct = Math.round(taxRate * 100)
  const seat = seats.find((s) => s.id === currentSeatId)
  const items = currentSeatId ? (orders[currentSeatId] ?? []) : []

  // 未会計の卓（明細のある卓）
  const unpaidSeats = seats.filter((s) => (orders[s.id]?.length ?? 0) > 0)
  const unpaidIds = unpaidSeats.map((s) => s.id).join(',')
  const seatTotal = (id: string) =>
    calcBill((orders[id] ?? []).reduce((a, x) => a + x.priceExTax * x.qty, 0), taxRate, taxMode).total

  const base = items.reduce((s, x) => s + x.priceExTax * x.qty, 0)
  const { subtotal, tax: taxAmt, total: totalAmt } = calcBill(base, taxRate, taxMode)

  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [cashReceived, setCashReceived] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  // 分割支払い（1会計で現金＋カード等を混在）
  const [split, setSplit] = useState(false)
  const [splitCard, setSplitCard] = useState<number | null>(null)
  const [splitQr, setSplitQr] = useState<number | null>(null)

  // 現在の卓に明細が無ければ、未会計の卓を自動で選ぶ
  useEffect(() => {
    if (items.length === 0 && unpaidSeats.length > 0) setCurrentSeat(unpaidSeats[0].id)
  }, [items.length, unpaidIds, unpaidSeats, setCurrentSeat])

  // 卓を切り替えたらお預かり金額・分割入力をリセット
  useEffect(() => { setCashReceived(null); setSplit(false); setSplitCard(null); setSplitQr(null) }, [currentSeatId])

  const feeRate = payMethod === 'card' ? feeSettings.card : payMethod === 'qr' ? feeSettings.qr : 0
  const feeAmt = calcFee(totalAmt, feeRate)
  const netAmt = totalAmt - feeAmt

  const change = cashReceived != null ? cashReceived - totalAmt : null

  // 分割支払いの計算：カード・QRを入力し、現金は残り。手数料はカード/QR分のみ。
  const splitCardAmt = split ? (splitCard ?? 0) : 0
  const splitQrAmt = split ? (splitQr ?? 0) : 0
  const splitCashAmt = totalAmt - splitCardAmt - splitQrAmt
  const splitFeeAmt = calcFee(splitCardAmt, feeSettings.card) + calcFee(splitQrAmt, feeSettings.qr)
  const splitNetAmt = totalAmt - splitFeeAmt
  const splitValid = splitCashAmt >= 0 && splitCardAmt >= 0 && splitQrAmt >= 0 && (splitCardAmt + splitQrAmt) > 0

  const canConfirm = split
    ? splitValid
    : payMethod !== 'cash' || (cashReceived != null && cashReceived >= totalAmt)

  const handleConfirm = async () => {
    if (!currentSeatId || !canConfirm || dayClosed) return
    setLoading(true)
    try {
      if (split) {
        const parts = [
          { method: 'cash' as PayMethod, amount: splitCashAmt },
          { method: 'card' as PayMethod, amount: splitCardAmt },
          { method: 'qr' as PayMethod, amount: splitQrAmt },
        ].filter((p) => p.amount > 0)
        const dominant = [...parts].sort((a, b) => b.amount - a.amount)[0].method
        await completePayment(currentSeatId, dominant, undefined, parts.length > 1 ? parts : undefined)
      } else {
        await completePayment(currentSeatId, payMethod, cashReceived ?? undefined)
      }
      onBack()
    } catch (e) {
      alert((e as Error)?.message ?? '会計に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const presets = CASH_PRESETS.filter((v) => v >= totalAmt)
  if (totalAmt > 0 && !presets.includes(totalAmt)) presets.unshift(totalAmt)
  presets.sort((a, b) => a - b)

  return (
    <div className="checkout-screen">
      <div className="checkout-top">
        <span className="checkout-title">
          {unpaidSeats.length === 0 ? '会計' : `${seat?.name || `席 ${seat?.id}`} の会計`}
        </span>
        <button className="back-btn" onClick={onBack}>← 注文へ</button>
      </div>

      {/* 未会計の卓を選択 */}
      <div className="checkout-seats">
        {unpaidSeats.length === 0 ? (
          <span className="checkout-seats-empty">未会計の卓はありません</span>
        ) : (
          unpaidSeats.map((s) => (
            <button
              key={s.id}
              className={`seat-chip ${s.id === currentSeatId ? 'active' : ''}`}
              onClick={() => setCurrentSeat(s.id)}
            >
              {s.solo && <span className="solo-dot" />}
              {s.name || `席 ${s.id}`}
              <span className="chip-total">¥{seatTotal(s.id).toLocaleString()}</span>
            </button>
          ))
        )}
      </div>

      {unpaidSeats.length === 0 ? (
        <div className="loading">注文入力で明細を追加すると、ここに会計する卓が表示されます。</div>
      ) : (
      <div className="checkout-body">
        {/* 左：注文内容 */}
        <div className="co-left">
          <div className="co-section-lbl">注文内容</div>
          {items.map((x) => (
            <div key={x.id} className="co-row">
              <span className="co-row-name">{x.name} × {x.qty}</span>
              <span className="co-row-cast">{x.cast}</span>
              <span className={`co-row-price ${x.priceExTax < 0 ? 'minus' : ''}`}>
                ¥{(x.priceExTax * x.qty).toLocaleString()}
              </span>
            </div>
          ))}
          {!taxIncluded && (
            <>
              <div className="co-subtotal">
                <span>小計 (税抜)</span><span>¥{subtotal.toLocaleString()}</span>
              </div>
              <div className="co-tax">
                <span>消費税 ({taxPct}%)</span><span>¥{taxAmt.toLocaleString()}</span>
              </div>
            </>
          )}
          <div className="co-total">
            <span className="co-total-lbl">合計</span>
            <span className="co-total-val">¥{totalAmt.toLocaleString()}</span>
          </div>
        </div>

        {/* 右：支払い */}
        <div className="co-right">
          <div className="pay-label">
            支払い方法
            <button
              className={`split-toggle ${split ? 'on' : ''}`}
              onClick={() => { setSplit((v) => !v); setCashReceived(null) }}
            >
              {split ? '✓ 支払いを分ける' : '支払いを分ける'}
            </button>
          </div>
          {!split && (
          <>
          <div className="pay-methods">
            {PAY_DEFS.map((pd) => (
              <button
                key={pd.k}
                className={`pay-btn ${payMethod === pd.k ? 'selected' : ''}`}
                onClick={() => { setPayMethod(pd.k); setCashReceived(null) }}
              >
                <span className="pay-btn-left">
                  <i className={`ti ${pd.icon}`} aria-hidden />
                  {pd.label}
                </span>
                {isOwner && pd.k !== 'cash' && (
                  <span className="fee-badge">
                    {feeSettings[pd.k as 'card' | 'qr'] > 0
                      ? `手数料 ${feeSettings[pd.k as 'card' | 'qr']}%`
                      : '手数料なし'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {payMethod === 'cash' && (
            <div className="cash-input-wrap">
              <div className="cash-lbl">お預かり金額</div>
              <input
                className="cash-free-input"
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="金額を入力"
                value={cashReceived ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  setCashReceived(e.target.value === '' || Number.isNaN(n) ? null : n)
                }}
              />
              <div className="cash-presets">
                {presets.slice(0, 5).map((v) => (
                  <button
                    key={v}
                    className={`cash-preset ${cashReceived === v ? 'selected' : ''}`}
                    onClick={() => setCashReceived(v)}
                  >
                    ¥{v.toLocaleString()}
                  </button>
                ))}
              </div>
              {change != null && change >= 0 && (
                <div className="change-row">
                  <div className="change-lbl">お釣り</div>
                  <div className="change-val">¥{change.toLocaleString()}</div>
                </div>
              )}
            </div>
          )}

          {payMethod !== 'cash' && isOwner && (
            <div className="fee-info">
              <div className="fee-info-row">
                <span className="fee-info-lbl">売上金額</span>
                <span className="fee-info-val">¥{totalAmt.toLocaleString()}</span>
              </div>
              <div className="fee-info-row">
                <span className="fee-info-lbl">{PAY_DEFS.find(p=>p.k===payMethod)?.label}手数料 ({feeRate}%)</span>
                <span className="fee-info-val danger">−¥{feeAmt.toLocaleString()}</span>
              </div>
              <div className="fee-info-row net">
                <span className="fee-info-lbl">実際の入金額</span>
                <span className="fee-info-val">¥{netAmt.toLocaleString()}</span>
              </div>
            </div>
          )}
          </>
          )}

          {split && (
            <div className="split-pay">
              <div className="split-hint">カード・QRの金額を入力すると、残りが自動で現金になります。</div>
              <div className="split-row">
                <span className="split-lbl"><i className="ti ti-credit-card" aria-hidden /> カード</span>
                <input
                  className="split-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={splitCard ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setSplitCard(e.target.value === '' || Number.isNaN(n) ? null : n)
                  }}
                />
              </div>
              <div className="split-row">
                <span className="split-lbl"><i className="ti ti-device-mobile" aria-hidden /> QR払い</span>
                <input
                  className="split-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0"
                  value={splitQr ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setSplitQr(e.target.value === '' || Number.isNaN(n) ? null : n)
                  }}
                />
              </div>
              <div className="split-row cash">
                <span className="split-lbl"><i className="ti ti-cash" aria-hidden /> 現金（残り）</span>
                <span className={`split-cash-val ${splitCashAmt < 0 ? 'danger' : ''}`}>¥{splitCashAmt.toLocaleString()}</span>
              </div>
              {splitCashAmt < 0 && (
                <div className="split-warn">カード＋QRが合計を超えています。</div>
              )}
              {isOwner && splitFeeAmt > 0 && (
                <div className="fee-info">
                  <div className="fee-info-row">
                    <span className="fee-info-lbl">売上金額</span>
                    <span className="fee-info-val">¥{totalAmt.toLocaleString()}</span>
                  </div>
                  <div className="fee-info-row">
                    <span className="fee-info-lbl">決済手数料</span>
                    <span className="fee-info-val danger">−¥{splitFeeAmt.toLocaleString()}</span>
                  </div>
                  <div className="fee-info-row net">
                    <span className="fee-info-lbl">実際の入金額</span>
                    <span className="fee-info-val">¥{splitNetAmt.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {dayClosed && (
            <div className="close-warn">{entryDate} は締め済みです。締め解除すると入力できます。</div>
          )}
          <button
            className="confirm-btn"
            disabled={!canConfirm || loading || dayClosed}
            onClick={handleConfirm}
          >
            {loading ? '処理中...' : dayClosed ? '締め済み' : '支払い確定'}
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
