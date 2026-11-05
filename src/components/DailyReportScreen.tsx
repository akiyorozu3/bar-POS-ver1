import { useEffect, useState } from 'react'
import { usePosStore, todayStr } from '@/store/posStore'
import type { DailyReport } from '@/types'

const yen = (n: number) => `¥${(n || 0).toLocaleString()}`
// '2026-10-29' → '10/29'
const mdOf = (d: string) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
// '05:00' → '5:00'（先頭ゼロを外して表示）
const hm = (t: string) => t.replace(/^0/, '')

export default function DailyReportScreen() {
  const { dailyReports, dailyReportsLoading, subscribeDailyReports, addDailyReport, deleteDailyReport, fetchDaySales, role } = usePosStore()
  const isReadOnly = role === 'zeimu'
  const canDelete = role === 'owner' || role === 'manager'

  const [mode, setMode] = useState<'list' | 'new'>('list')
  const [view, setView] = useState<DailyReport | null>(null)

  // 新規フォーム
  const [date, setDate] = useState(todayStr())
  const [author, setAuthor] = useState('')
  const [openTime, setOpenTime] = useState('19:00')
  const [closeTime, setCloseTime] = useState('05:00')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [qr, setQr] = useState('')
  const [registerCash, setRegisterCash] = useState('')
  const [orders, setOrders] = useState('')
  const [notes, setNotes] = useState('')
  const [salesLoading, setSalesLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeDailyReports(), [subscribeDailyReports])

  // 新規フォームを開く（売上を自動入力）
  const openNew = async () => {
    const d = todayStr()
    setDate(d); setAuthor(''); setOpenTime('19:00'); setCloseTime('05:00')
    setCash(''); setCard(''); setQr(''); setRegisterCash(''); setOrders(''); setNotes('')
    setMode('new')
    setSalesLoading(true)
    const s = await fetchDaySales(d)
    setCash(String(s.cash)); setCard(String(s.card)); setQr(String(s.qr))
    setSalesLoading(false)
  }

  // 日付を変えたら、その営業日の売上を取り直す
  const changeDate = async (d: string) => {
    setDate(d)
    if (!d) return
    setSalesLoading(true)
    const s = await fetchDaySales(d)
    setCash(String(s.cash)); setCard(String(s.card)); setQr(String(s.qr))
    setSalesLoading(false)
  }

  const num = (s: string) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : 0 }
  const handleSave = async () => {
    if (!date) return
    setBusy(true)
    try {
      await addDailyReport({
        date, author: author.trim(), openTime, closeTime,
        cash: num(cash), card: num(card), qr: num(qr), registerCash: num(registerCash),
        orders: orders.trim(), notes: notes.trim(),
      })
      setMode('list')
    } finally { setBusy(false) }
  }

  const handleDelete = async (r: DailyReport) => {
    if (!confirm(`${r.date} の日報を削除しますか？`)) return
    await deleteDailyReport(r.id)
    if (view?.id === r.id) setView(null)
  }

  // ── 新規追加フォーム ──
  if (mode === 'new') {
    return (
      <div className="report-screen">
        <div className="report-top">
          <button className="period-btn" onClick={() => setMode('list')}>‹ 一覧へ戻る</button>
          <span className="report-title">日報の新規作成</span>
        </div>
        <div className="fee-settings report-form">
          <div className="report-field">
            <label className="report-lbl">日付</label>
            <input type="date" value={date} max={todayStr()} onChange={(e) => changeDate(e.target.value)} />
          </div>
          <div className="report-field">
            <label className="report-lbl">担当者</label>
            <input type="text" placeholder="担当者名" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="report-field">
            <label className="report-lbl">営業時間</label>
            <span className="report-time">
              <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              <span className="report-sep">〜</span>
              <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </span>
          </div>

          <div className="report-sec-title">売上金{salesLoading ? '（取得中…）' : '（自動入力・修正可）'}</div>
          <div className="report-field">
            <label className="report-lbl">現金</label>
            <div className="report-money"><span>¥</span><input type="number" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} /></div>
          </div>
          <div className="report-field">
            <label className="report-lbl">カード</label>
            <div className="report-money"><span>¥</span><input type="number" inputMode="numeric" value={card} onChange={(e) => setCard(e.target.value)} /></div>
          </div>
          <div className="report-field">
            <label className="report-lbl">QR</label>
            <div className="report-money"><span>¥</span><input type="number" inputMode="numeric" value={qr} onChange={(e) => setQr(e.target.value)} /></div>
          </div>

          <div className="report-sec-title">レジ金</div>
          <div className="report-field">
            <label className="report-lbl">レジ金</label>
            <div className="report-money"><span>¥</span><input type="number" inputMode="numeric" value={registerCash} onChange={(e) => setRegisterCash(e.target.value)} /></div>
          </div>

          <div className="report-sec-title">発注</div>
          <textarea className="report-textarea" placeholder="発注内容（なければ「なし」）" value={orders} onChange={(e) => setOrders(e.target.value)} rows={2} />

          <div className="report-sec-title">引継事項・備考</div>
          <textarea className="report-textarea" placeholder="引継事項・備考" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="modal-btn ok" onClick={handleSave} disabled={busy || !date}>確定して保存</button>
            <button className="modal-btn" onClick={() => setMode('list')} disabled={busy}>キャンセル</button>
          </div>
        </div>
      </div>
    )
  }

  // ── 一覧（メイン） ──
  return (
    <div className="report-screen">
      <div className="report-top">
        <span className="report-title"><i className="ti ti-notebook" aria-hidden /> 日報</span>
        {!isReadOnly && (
          <button className="top-action-btn active-s" onClick={openNew}>
            <i className="ti ti-plus" aria-hidden /> 新規追加
          </button>
        )}
      </div>

      {dailyReportsLoading ? (
        <div className="loading">読み込み中...</div>
      ) : dailyReports.length === 0 ? (
        <div className="mm-empty" style={{ padding: 16 }}>日報はまだありません{!isReadOnly && '。「新規追加」から作成できます'}</div>
      ) : (
        <div className="report-list">
          {dailyReports.map((r) => (
            <div key={r.id} className="report-row" onClick={() => setView(r)}>
              <span className="report-row-date">{mdOf(r.date)}</span>
              <span className="report-row-author">{r.author || '担当者未記入'}</span>
              <span className="report-row-sales">売上 {yen(r.cash + r.card + r.qr)}</span>
              {canDelete && (
                <button className="mm-row-del" onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>削除</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 閲覧（出力フォーマット） */}
      {view && (
        <div className="modal-overlay" onClick={() => setView(null)}>
          <div className="modal report-view" onClick={(e) => e.stopPropagation()}>
            <div className="report-view-date">{mdOf(view.date)}</div>
            {view.author && <div className="report-view-author">担当：{view.author}</div>}
            <div className="report-view-line">営業時間：{hm(view.openTime)}〜{hm(view.closeTime)}</div>

            <div className="report-view-sec">売上金</div>
            <div className="report-view-kv"><span>現金</span><span>{yen(view.cash)}</span></div>
            <div className="report-view-kv"><span>カード</span><span>{yen(view.card)}</span></div>
            <div className="report-view-kv"><span>QR</span><span>{yen(view.qr)}</span></div>
            <div className="report-view-kv total"><span>合計</span><span>{yen(view.cash + view.card + view.qr)}</span></div>

            <div className="report-view-sec">レジ金</div>
            <div className="report-view-kv"><span /><span>{yen(view.registerCash)}</span></div>

            <div className="report-view-sec">発注</div>
            <div className="report-view-free">{view.orders || 'なし'}</div>

            <div className="report-view-sec">引継事項</div>
            <div className="report-view-free">{view.notes || '—'}</div>

            <div className="modal-btns" style={{ marginTop: 12 }}>
              <button className="modal-btn ok" onClick={() => setView(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
