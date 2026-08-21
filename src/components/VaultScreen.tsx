import { useEffect, useMemo, useState } from 'react'
import { usePosStore, todayStr, businessDayStart } from '@/store/posStore'
import { buildMovements } from '@/lib/vault'

// 手動入出金の区分（dir=符号）。その他の入出金は「経費」(±)で記録＝自動反映されるので、
// ここは経費で表せない分だけ：カード/QR入金（＋）と 給与出金（−）の2つに絞る。
const CATS: { key: string; label: string; dir: 1 | -1 }[] = [
  { key: 'card', label: 'カード/QR入金', dir: 1 },
  { key: 'wage', label: '給与出金', dir: -1 },
  { key: 'tax-pay', label: '源泉納付', dir: -1 },
]

const yen = (n: number) => `¥${n.toLocaleString()}`
const monthLabel = (m: string) => { const [y, mo] = m.split('-'); return `${y}年${Number(mo)}月` }

export default function VaultScreen() {
  const {
    transactions, expenses, recurringExpenses, payouts, cashEntries, cashOpening,
    subscribeTransactions, subscribeExpenses, subscribePayouts, subscribeRecurringExpenses,
    subscribeCashEntries, subscribeCashSettings,
    addCashEntry, deleteCashEntry, saveCashOpening,
  } = usePosStore()

  const today = todayStr()
  const openingDate = cashOpening.openingDate

  // 期首の状態を購読
  useEffect(() => subscribeCashSettings(), [subscribeCashSettings])
  useEffect(() => subscribeRecurringExpenses(), [subscribeRecurringExpenses])
  // 期首日〜今日の実データを購読（現金売上・経費・日払い/大入・手動入出金）
  useEffect(() => {
    const from = businessDayStart(openingDate)
    const to = new Date()
    const unsubs = [
      subscribeTransactions(from, to),
      subscribeExpenses(from, to),
      subscribePayouts(from, to),
      subscribeCashEntries(openingDate),
    ]
    return () => unsubs.forEach((u) => u())
  }, [openingDate, subscribeTransactions, subscribeExpenses, subscribePayouts, subscribeCashEntries])

  const movements = useMemo(() => buildMovements({
    openingDate, today, transactions, expenses, recurringExpenses, payouts, cashEntries,
  }), [openingDate, today, transactions, expenses, recurringExpenses, payouts, cashEntries])

  const currentBalance = cashOpening.openingBalance + movements.reduce((a, m) => a + m.amount, 0)

  // 源泉徴収 預かり残高（未納）＝ 給与出金で預かった源泉の累計 − 源泉納付の累計（現金ベース＝金庫に残っている税預かり）
  const taxHeld = cashEntries
    .filter((c) => c.date >= openingDate && c.date <= today)
    .reduce((a, c) => a + (c.withholding ?? 0) - (c.category === 'tax-pay' ? Math.abs(c.amount) : 0), 0)

  // 月ナビ
  const [month, setMonth] = useState(today.slice(0, 7))
  const shiftMonth = (delta: number) => {
    const [y, mo] = month.split('-').map(Number)
    const d = new Date(y, mo - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const carry = cashOpening.openingBalance + movements.filter((m) => m.date < `${month}-01`).reduce((a, m) => a + m.amount, 0)
  const monthMovs = movements.filter((m) => m.date.slice(0, 7) === month)
  let run = carry
  const rows = monthMovs.map((m) => { run += m.amount; return { ...m, balance: run } })
  const monthIn = monthMovs.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0)
  const monthOut = monthMovs.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0)
  const monthEnd = carry + monthIn + monthOut

  // 手動入出金の追加フォーム
  const [date, setDate] = useState(today)
  const [cat, setCat] = useState('card')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [withhold, setWithhold] = useState('')   // 給与出金の「うち源泉（預かり）」
  const [busy, setBusy] = useState(false)
  const handleAdd = async () => {
    const n = parseInt(amount, 10)
    if (!date || !Number.isFinite(n) || n === 0) return
    const dir = CATS.find((c) => c.key === cat)?.dir ?? 1
    const wh = cat === 'wage' ? parseInt(withhold, 10) : NaN
    setBusy(true)
    try {
      await addCashEntry(date, dir * Math.abs(n), cat, memo, Number.isFinite(wh) && wh > 0 ? wh : undefined)
      setAmount(''); setMemo(''); setWithhold('')
    } finally { setBusy(false) }
  }

  // 期首残高の編集
  const [showOpening, setShowOpening] = useState(false)

  return (
    <div className="vault-screen">
      {/* 現在残高 */}
      <div className="vault-head">
        <div className="vault-balance">
          <span className="vault-balance-lbl">金庫の残高（今日時点・あるべき額）</span>
          <span className={`vault-balance-val ${currentBalance < 0 ? 'minus' : ''}`}>{yen(currentBalance)}</span>
          {taxHeld !== 0 && (
            <span className="vault-taxheld">うち源泉徴収 預かり（未納） {yen(taxHeld)}</span>
          )}
        </div>
        <button className="vault-opening-btn" onClick={() => setShowOpening((v) => !v)}>期首残高</button>
      </div>

      {showOpening && <OpeningEditor initBalance={cashOpening.openingBalance} initDate={openingDate} onSave={saveCashOpening} onClose={() => setShowOpening(false)} />}

      {/* 追加フォーム */}
      <div className="vault-add">
        <div className="vault-add-title">入出金を追加（カード/QR入金・給与出金）</div>
        <div className="vault-add-row">
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="number" inputMode="numeric" placeholder="金額" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="vault-add-row">
          <input className="vault-memo" placeholder="メモ（任意・例：7月分1回目 / ●●さん給与）" value={memo} onChange={(e) => setMemo(e.target.value)} />
          {cat === 'wage' && (
            <input type="number" inputMode="numeric" placeholder="うち源泉(任意)" value={withhold} onChange={(e) => setWithhold(e.target.value)} title="給与から預かった源泉徴収額（手取りで出金した場合）" />
          )}
          <button className="vault-add-btn" onClick={handleAdd} disabled={busy}>追加</button>
        </div>
        <div className="vault-hint">現金売上・経費・日払い・大入は自動反映（下の台帳に「自動」表示）。カード/QR売上は入金時にここで手入力。給与を手取りで払ったら「うち源泉」に預かり額を入れると、上の「源泉徴収 預かり（未納）」に積み上がります。税務署へ払ったら区分「源泉納付」で出金してください（預かりが減ります）。</div>
      </div>

      {/* 月ナビ＋サマリー */}
      <div className="vault-month-nav">
        <button className="date-step" onClick={() => shiftMonth(-1)} aria-label="前の月">‹</button>
        <span className="vault-month-label">{monthLabel(month)}</span>
        <button className="date-step" onClick={() => shiftMonth(1)} aria-label="次の月">›</button>
        <button className="shift-thisweek" onClick={() => setMonth(today.slice(0, 7))}>今月</button>
      </div>
      <div className="vault-summary">
        <span>繰越 {yen(carry)}</span>
        <span className="in">入金 {yen(monthIn)}</span>
        <span className="out">出金 {yen(monthOut)}</span>
        <span className="end">月末残高 {yen(monthEnd)}</span>
      </div>

      {/* 台帳 */}
      <div className="vault-table-wrap">
        <table className="vault-table">
          <thead>
            <tr><th>日付</th><th>内容</th><th>入金</th><th>出金</th><th>残高</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="vault-empty">この月の動きはありません</td></tr>
            ) : [...rows].reverse().map((r, i) => (
              <tr key={i} className={r.auto ? '' : 'manual'}>
                <td>{r.date.slice(5).replace('-', '/')}</td>
                <td className="vault-label">{r.label}{r.auto && <span className="vault-auto">自動</span>}</td>
                <td className="in">{r.amount > 0 ? yen(r.amount) : ''}</td>
                <td className="out">{r.amount < 0 ? yen(-r.amount) : ''}</td>
                <td className={r.balance < 0 ? 'minus' : ''}>{yen(r.balance)}</td>
                <td>{!r.auto && r.entryId && (
                  <button className="vault-del" onClick={() => deleteCashEntry(r.entryId!)} title="削除">×</button>
                )}</td>
              </tr>
            ))}
            <tr className="vault-carry"><td colSpan={4}>繰越残高</td><td>{yen(carry)}</td><td /></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 期首残高エディタ
function OpeningEditor({ initBalance, initDate, onSave, onClose }: {
  initBalance: number; initDate: string
  onSave: (bal: number, date: string) => Promise<void>
  onClose: () => void
}) {
  const [bal, setBal] = useState(String(initBalance))
  const [date, setDate] = useState(initDate)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const n = parseInt(bal, 10)
    if (!date || !Number.isFinite(n)) return
    setBusy(true)
    try { await onSave(n, date); onClose() } finally { setBusy(false) }
  }
  return (
    <div className="vault-opening">
      <div className="vault-opening-title">期首残高（この日時点の金庫残高から積み上げます）</div>
      <div className="vault-add-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" inputMode="numeric" placeholder="期首残高" value={bal} onChange={(e) => setBal(e.target.value)} />
        <button className="vault-add-btn" onClick={save} disabled={busy}>保存</button>
      </div>
      <div className="vault-hint">※ この日より前の売上・経費は金庫残高に含めません。導入時点の実際の残高を入れてください。</div>
    </div>
  )
}
