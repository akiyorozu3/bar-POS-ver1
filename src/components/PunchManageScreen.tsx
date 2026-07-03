import { useEffect, useState } from 'react'
import { usePosStore, todayStr, businessDayStart, businessDayEnd } from '@/store/posStore'
import { castLabel } from '@/lib/cast'
import { buildShifts, hhmm, durationLabel, toDatetimeLocal, fromDatetimeLocal } from '@/lib/punch'
import { buildShiftCSV, downloadCSV } from '@/lib/csv'
import type { Punch } from '@/types'

export default function PunchManageScreen() {
  const { punches, subscribePunches } = usePosStore()
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [showEdit, setShowEdit] = useState(false)
  const [problemOnly, setProblemOnly] = useState(false)

  // 営業日(17:00〜翌17:00)の範囲＋前後12時間バッファを付けて購読（日またぎ対応）
  useEffect(() => {
    const bf = businessDayStart(from); bf.setHours(bf.getHours() - 12)
    const bt = businessDayEnd(to); bt.setHours(bt.getHours() + 12)
    if (isNaN(bf.getTime()) || isNaN(bt.getTime())) return
    return subscribePunches(bf, bt)
  }, [from, to, subscribePunches])

  const inRange = (d: string) => d >= from && d <= to
  const { shifts, strayOuts } = buildShifts(punches)
  const shownShifts = shifts.filter((s) => inRange(s.date))
  const shownStray = strayOuts.filter((p) => inRange(p.date))
  const rawInRange = punches.filter((p) => inRange(p.date)).sort((a, b) => b.at - a.at)

  // 不整合（未退勤 = 出勤のまま / 退勤のみ = 出勤なし退勤）
  const openShifts = shownShifts.filter((s) => s.outAt == null)
  const problemIds = new Set<string>([...openShifts.map((s) => s.inId), ...shownStray.map((p) => p.id)])
  const probMap = new Map<string, { name: string; open: number; stray: number }>()
  for (const s of openShifts) {
    const e = probMap.get(s.castId) ?? { name: castLabel(s), open: 0, stray: 0 }
    e.open++; probMap.set(s.castId, e)
  }
  for (const p of shownStray) {
    const e = probMap.get(p.castId) ?? { name: castLabel(p), open: 0, stray: 0 }
    e.stray++; probMap.set(p.castId, e)
  }
  const problems = [...probMap.values()]
  const rawShown = problemOnly ? rawInRange.filter((p) => problemIds.has(p.id)) : rawInRange

  const handleCsv = () => {
    downloadCSV(buildShiftCSV(shownShifts), `勤務_${from}_${to}.csv`.replace(/-/g, ''))
  }

  return (
    <div className="sales-screen">
      <div className="sales-top">
        <span className="mm-title" style={{ marginRight: 8 }}>打刻管理</span>
        <label className="punch-range">開始 <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="punch-range">終了 <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="export-btn" onClick={handleCsv}>
            <i className="ti ti-download" aria-hidden /> 勤務CSV
          </button>
        </div>
      </div>

      <div className="sales-body">
        {/* 勤務一覧（ペア済み） */}
        <div>
          <div className="section-title">勤務一覧（{shownShifts.length}件）</div>
          <div className="punch-table">
            <div className="punch-head">
              <span>日付</span><span>キャスト</span><span>出勤</span><span>退勤</span><span>勤務時間</span>
            </div>
            {shownShifts.length === 0 ? (
              <div className="punch-empty2">この期間の勤務はありません</div>
            ) : shownShifts.map((s, i) => (
              <div className={`punch-body-row ${s.outAt == null ? 'warn' : ''}`} key={i}>
                <span>{s.date.replace(/-/g, '/')}</span>
                <span>{castLabel({ name: s.name, realName: s.realName })}</span>
                <span>{hhmm(s.inAt)}</span>
                <span>{s.outAt == null ? '— 勤務中' : hhmm(s.outAt)}</span>
                <span>{durationLabel(s.inAt, s.outAt)}</span>
              </div>
            ))}
          </div>
          {problems.length > 0 && (
            <div className="close-warn" style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 4 }}>⚠ 要修正のキャスト（下の「打刻の修正」で直せます）:</div>
              {problems.map((p, i) => (
                <div key={i}>
                  ・<b>{p.name}</b>
                  {p.open > 0 && <span> 未退勤×{p.open}</span>}
                  {p.stray > 0 && <span> 退勤のみ×{p.stray}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 打刻の修正（オーナー） */}
        <div>
          <button className="top-action-btn" onClick={() => setShowEdit((v) => !v)}>
            <i className="ti ti-pencil" aria-hidden /> 打刻の修正・手動追加 {showEdit ? '▲' : '▼'}
          </button>
          {showEdit && (
            <div className="punch-edit-wrap">
              <PunchAddRow />
              <div className="punch-edit-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>打刻一覧（{rawShown.length}件・新しい順）</span>
                {problemIds.size > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#854f0b' }}>
                    <input type="checkbox" checked={problemOnly} onChange={(e) => setProblemOnly(e.target.checked)} />
                    要修正のみ表示
                  </label>
                )}
              </div>
              {rawShown.length === 0
                ? <div className="punch-empty2">{problemOnly ? '要修正の打刻はありません' : 'この期間の打刻はありません'}</div>
                : rawShown.map((p) => <PunchEditRow key={p.id} punch={p} problem={problemIds.has(p.id)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 手動で打刻を追加 ─────────────────────────────
function PunchAddRow() {
  const { casts, addPunchAt } = usePosStore()
  const [castId, setCastId] = useState('')
  const [dt, setDt] = useState(toDatetimeLocal(Date.now()))
  const [type, setType] = useState<'in' | 'out'>('in')
  const [busy, setBusy] = useState(false)

  const at = fromDatetimeLocal(dt)
  const canAdd = !!castId && !Number.isNaN(at)

  const handleAdd = async () => {
    if (!canAdd) return
    setBusy(true)
    try { await addPunchAt(castId, type, at) } finally { setBusy(false) }
  }

  return (
    <div className="punch-edit-row add">
      <select className="cast-sel" value={castId} onChange={(e) => setCastId(e.target.value)}>
        <option value="">キャスト</option>
        {casts.map((c) => <option key={c.id} value={c.id}>{castLabel(c)}</option>)}
      </select>
      <input className="punch-dt" type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
      <select className="cast-sel" value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')}>
        <option value="in">出勤</option>
        <option value="out">退勤</option>
      </select>
      <button className="mm-add-btn" onClick={handleAdd} disabled={!canAdd || busy}>＋ 追加</button>
    </div>
  )
}

// ── 打刻の1行（編集・削除） ───────────────────────
function PunchEditRow({ punch, problem }: { punch: Punch; problem?: boolean }) {
  const { updatePunch, deletePunch } = usePosStore()
  const [dt, setDt] = useState(toDatetimeLocal(punch.at))
  const [type, setType] = useState<'in' | 'out'>(punch.type)
  const [busy, setBusy] = useState(false)

  const at = fromDatetimeLocal(dt)
  const dirty = at !== punch.at || type !== punch.type
  const valid = !Number.isNaN(at)

  const handleSave = async () => {
    if (!dirty || !valid) return
    setBusy(true)
    try { await updatePunch(punch.id, at, type) } finally { setBusy(false) }
  }
  const handleDelete = async () => {
    if (!confirm(`${punch.name || punch.realName} の打刻を削除しますか？`)) return
    setBusy(true)
    try { await deletePunch(punch.id) } finally { setBusy(false) }
  }

  return (
    <div className={`punch-edit-row ${problem ? 'problem' : ''}`}>
      <span className="punch-edit-name">
        {problem && <span className="punch-warn-badge">⚠</span>}
        {castLabel({ name: punch.name, realName: punch.realName })}
      </span>
      <input className="punch-dt" type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
      <select className="cast-sel" value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')}>
        <option value="in">出勤</option>
        <option value="out">退勤</option>
      </select>
      <button className="mm-row-save" onClick={handleSave} disabled={!dirty || !valid || busy}>保存</button>
      <button className="mm-row-del" onClick={handleDelete} disabled={busy}>削除</button>
    </div>
  )
}
