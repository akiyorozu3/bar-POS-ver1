import { useEffect, useState } from 'react'
import { usePosStore, todayStr } from '@/store/posStore'
import { castLabel } from '@/lib/cast'

const hhmm = (at: number) =>
  new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

export default function PunchModal({ onClose }: { onClose: () => void }) {
  const { casts, punches, subscribePunches, addPunch } = usePosStore()
  const [castId, setCastId] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  // 今日の打刻を購読
  useEffect(() => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return subscribePunches(from, to)
  }, [subscribePunches])

  const punch = async (type: 'in' | 'out') => {
    if (!castId || busy) return
    setBusy(true)
    try {
      await addPunch(castId, type)
      const c = casts.find((x) => x.id === castId)
      setFlash(`${c ? castLabel(c) : ''} を${type === 'in' ? '出勤' : '退勤'}で打刻しました`)
      setTimeout(() => setFlash(''), 2500)
    } catch (e) {
      alert('打刻に失敗しました。\n' + ((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal punch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">打刻（{todayStr().replace(/-/g, '/')}）</div>

        <label>キャストを選択</label>
        <select className="punch-cast-sel" value={castId} onChange={(e) => setCastId(e.target.value)}>
          <option value="">選択してください</option>
          {casts.map((c) => <option key={c.id} value={c.id}>{castLabel(c)}</option>)}
        </select>

        <div className="punch-btns">
          <button className="punch-btn in" onClick={() => punch('in')} disabled={!castId || busy}>出勤</button>
          <button className="punch-btn out" onClick={() => punch('out')} disabled={!castId || busy}>退勤</button>
        </div>

        {flash && <div className="punch-flash">{flash}</div>}

        <div className="punch-list-title">今日の打刻（{punches.length}件）</div>
        <div className="punch-list">
          {punches.length === 0
            ? <p className="punch-empty">まだ打刻がありません</p>
            : punches.map((p) => (
              <div key={p.id} className="punch-row">
                <span className={`punch-type ${p.type}`}>{p.type === 'in' ? '出勤' : '退勤'}</span>
                <span className="punch-name">{p.name || p.realName}</span>
                <span className="punch-time">{hhmm(p.at)}</span>
              </div>
            ))
          }
        </div>

        <div className="modal-btns" style={{ marginTop: 10 }}>
          <button className="modal-btn ok" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
