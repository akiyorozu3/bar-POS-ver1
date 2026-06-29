import { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { toTaxInc, calcTax, calcFee } from '@/lib/tax'
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
  const { seats, currentSeatId, orders, feeSettings, completePayment, role } = usePosStore()
  const isOwner = role === 'owner'
  const seat = seats.find((s) => s.id === currentSeatId)
  const items = currentSeatId ? (orders[currentSeatId] ?? []) : []

  const subtotal = items.reduce((s, x) => s + x.priceExTax * x.qty, 0)
  const taxAmt = calcTax(subtotal)
  const totalAmt = subtotal + taxAmt

  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [cashReceived, setCashReceived] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const feeRate = payMethod === 'card' ? feeSettings.card : payMethod === 'qr' ? feeSettings.qr : 0
  const feeAmt = calcFee(totalAmt, feeRate)
  const netAmt = totalAmt - feeAmt

  const change = cashReceived != null ? cashReceived - totalAmt : null
  const canConfirm =
    payMethod !== 'cash' || (cashReceived != null && cashReceived >= totalAmt)

  const handleConfirm = async () => {
    if (!currentSeatId || !canConfirm) return
    setLoading(true)
    try {
      await completePayment(currentSeatId, payMethod, cashReceived ?? undefined)
      onBack()
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
          {seat?.name || `席 ${seat?.id}`} の会計
        </span>
        <button className="back-btn" onClick={onBack}>← 戻る</button>
      </div>

      <div className="checkout-body">
        {/* 左：注文内容 */}
        <div className="co-left">
          <div className="co-section-lbl">注文内容</div>
          {items.map((x) => (
            <div key={x.id} className="co-row">
              <span className="co-row-name">{x.name} × {x.qty}</span>
              <span className="co-row-cast">{x.cast}</span>
              <span className="co-row-price">
                ¥{toTaxInc(x.priceExTax * x.qty).toLocaleString()}
              </span>
            </div>
          ))}
          <div className="co-subtotal">
            <span>小計</span><span>¥{subtotal.toLocaleString()}</span>
          </div>
          <div className="co-tax">
            <span>消費税 (10%)</span><span>¥{taxAmt.toLocaleString()}</span>
          </div>
          <div className="co-total">
            <span className="co-total-lbl">合計</span>
            <span className="co-total-val">¥{totalAmt.toLocaleString()}</span>
          </div>
        </div>

        {/* 右：支払い */}
        <div className="co-right">
          <div className="pay-label">支払い方法</div>
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

          <button
            className="confirm-btn"
            disabled={!canConfirm || loading}
            onClick={handleConfirm}
          >
            {loading ? '処理中...' : '支払い確定'}
          </button>
        </div>
      </div>
    </div>
  )
}
