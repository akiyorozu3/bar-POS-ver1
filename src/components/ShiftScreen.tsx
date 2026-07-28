import { useEffect, useMemo, useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { castLabel } from '@/lib/cast'
import {
  weekMonday, addWeeks, weekDates, ymd, dayLabel, weekRangeLabel, weekIdOf, todayYmd,
} from '@/lib/week'
import type { ScheduledShift } from '@/types'

type EditTarget = { castId: string; castName: string; date: string; dateLabel: string }

export default function ShiftScreen() {
  const {
    casts: allCasts, shifts, shiftWeeks,
    subscribeShifts, subscribeShiftWeeks, saveShift, deleteShift, setWeekConfirmed,
  } = usePosStore()
  // 在籍中のキャストだけシフト表に出す（在籍外＝active:false は非表示。注文・打刻には影響しない）
  const casts = useMemo(() => allCasts.filter((c) => c.active !== false), [allCasts])

  const [monday, setMonday] = useState<Date>(() => weekMonday(new Date()))
  const [editing, setEditing] = useState<EditTarget | null>(null)

  const dates = useMemo(() => weekDates(monday), [monday])
  const fromStr = ymd(dates[0])
  const toStr = ymd(dates[6])
  const weekId = weekIdOf(monday)
  const today = todayYmd()

  // 表示中の週のシフトを購読
  useEffect(() => subscribeShifts(fromStr, toStr), [subscribeShifts, fromStr, toStr])
  // 週の確定状態を購読（全週・少量）
  useEffect(() => subscribeShiftWeeks(), [subscribeShiftWeeks])

  const shiftMap = useMemo(() => {
    const m = new Map<string, ScheduledShift>()
    for (const s of shifts) m.set(`${s.castId}_${s.date}`, s)
    return m
  }, [shifts])

  // 各日の OP/CL 集計と未定判定（シフトが1件以上ある日で OP か CL が欠けていれば未定）
  const dayInfo = useMemo(() => dates.map((d) => {
    const ds = ymd(d)
    const dayShifts = shifts.filter((s) => s.date === ds)
    const op = dayShifts.filter((s) => s.role === 'open')
    const cl = dayShifts.filter((s) => s.role === 'close')
    return { ds, hasShift: dayShifts.length > 0, op, cl, missing: dayShifts.length > 0 && (op.length === 0 || cl.length === 0) }
  }), [dates, shifts])

  const anyMissing = dayInfo.some((x) => x.missing)
  const confirmedAt = shiftWeeks.find((w) => w.id === weekId)?.confirmedAt
  const confirmed = confirmedAt != null

  const nameOf = (castId: string) => {
    const c = allCasts.find((x) => x.id === castId)
    return c ? castLabel(c) : castId
  }

  return (
    <div className="shift-screen">
      {/* ヘッダー：週切替・確定 */}
      <div className="shift-head">
        <div className="shift-week-nav">
          <button className="date-step" onClick={() => setMonday((m) => addWeeks(m, -1))} aria-label="前の週">‹</button>
          <span className="shift-week-label">
            {weekRangeLabel(monday)}
            <span className="shift-week-id">{weekId}</span>
          </span>
          <button className="date-step" onClick={() => setMonday((m) => addWeeks(m, 1))} aria-label="次の週">›</button>
          <button className="shift-thisweek" onClick={() => setMonday(weekMonday(new Date()))}>今週</button>
        </div>
        <div className="shift-confirm-wrap">
          {confirmed
            ? <span className="shift-badge confirmed">確定済み</span>
            : <span className="shift-badge draft">未確定</span>}
          <button
            className={`shift-confirm-btn ${confirmed ? 'undo' : ''}`}
            onClick={() => setWeekConfirmed(weekId, !confirmed)}
          >
            {confirmed ? '確定を解除' : '週を確定'}
          </button>
        </div>
      </div>

      {anyMissing && (
        <div className="shift-alert">⚠ OP・CL が未定の日があります（黄色いセル）。確定・通知の前に割り当ててください。</div>
      )}

      {casts.length === 0 ? (
        <div className="empty-today">キャストが登録されていません。「キャスト管理」から追加してください。</div>
      ) : (
        <div className="shift-table-wrap">
          <table className="shift-table">
            <thead>
              <tr>
                <th className="sh-corner">キャスト</th>
                {dates.map((d) => {
                  const ds = ymd(d)
                  const info = dayInfo.find((x) => x.ds === ds)
                  return (
                    <th key={ds} className={`sh-day ${ds === today ? 'today' : ''} ${info?.missing ? 'missing' : ''}`}>
                      {dayLabel(d)}
                    </th>
                  )
                })}
                <th className="sh-count">回数</th>
              </tr>
            </thead>
            <tbody>
              {casts.map((c) => {
                const count = dates.reduce((n, d) => n + (shiftMap.has(`${c.id}_${ymd(d)}`) ? 1 : 0), 0)
                return (
                  <tr key={c.id}>
                    <th className="sh-name">{castLabel(c)}</th>
                    {dates.map((d) => {
                      const ds = ymd(d)
                      const s = shiftMap.get(`${c.id}_${ds}`)
                      return (
                        <td
                          key={ds}
                          className={`sh-cell ${s ? 'on' : 'off'} ${ds === today ? 'today' : ''}`}
                          onClick={() => setEditing({ castId: c.id, castName: castLabel(c), date: ds, dateLabel: dayLabel(d) })}
                        >
                          {s ? (
                            <>
                              <span className="sh-time">{s.startTime}〜{s.endTime}</span>
                              {s.role === 'open' && <span className="sh-role op">OP</span>}
                              {s.role === 'close' && <span className="sh-role cl">CL</span>}
                            </>
                          ) : <span className="sh-off">—</span>}
                        </td>
                      )
                    })}
                    <td className="sh-count">{count}</td>
                  </tr>
                )
              })}
              {/* OP/CL 担当の一覧行 */}
              <tr className="sh-footrow">
                <th className="sh-name">OP担当</th>
                {dayInfo.map((x) => (
                  <td key={x.ds} className={`sh-footcell ${x.hasShift && x.op.length === 0 ? 'missing' : ''}`}>
                    {x.op.length ? x.op.map((s) => nameOf(s.castId)).join('・') : (x.hasShift ? '⚠未定' : '—')}
                  </td>
                ))}
                <td className="sh-count" />
              </tr>
              <tr className="sh-footrow">
                <th className="sh-name">CL担当</th>
                {dayInfo.map((x) => (
                  <td key={x.ds} className={`sh-footcell ${x.hasShift && x.cl.length === 0 ? 'missing' : ''}`}>
                    {x.cl.length ? x.cl.map((s) => nameOf(s.castId)).join('・') : (x.hasShift ? '⚠未定' : '—')}
                  </td>
                ))}
                <td className="sh-count" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="shift-hint">セルをタップして出勤時間・OP/CL を編集。休みにするには「休みにする」。</p>

      {editing && (
        <ShiftEditModal
          target={editing}
          existing={shiftMap.get(`${editing.castId}_${editing.date}`) ?? null}
          onClose={() => setEditing(null)}
          onSave={async (data) => { await saveShift(editing.castId, editing.date, data); setEditing(null) }}
          onDelete={async () => { await deleteShift(editing.castId, editing.date); setEditing(null) }}
        />
      )}
    </div>
  )
}

// ── セル編集モーダル ─────────────────────────────
function ShiftEditModal({ target, existing, onClose, onSave, onDelete }: {
  target: EditTarget
  existing: ScheduledShift | null
  onClose: () => void
  onSave: (data: { startTime: string; endTime: string; role: 'open' | 'close' | null }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [start, setStart] = useState(existing?.startTime ?? '19:00')
  const [end, setEnd] = useState(existing?.endTime ?? '23:00')
  const [role, setRole] = useState<'open' | 'close' | null>(existing?.role ?? null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!start || !end) return
    setBusy(true)
    try { await onSave({ startTime: start, endTime: end, role }) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await onDelete() } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{target.castName}　{target.dateLabel}</div>

        <label>出勤時間</label>
        <div className="shift-time-row">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <span>〜</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="shift-time-note">終了が開始より早い場合は翌朝までの勤務として扱います。</div>

        <label>担当</label>
        <div className="shift-role-btns">
          <button className={`shift-role-btn ${role === null ? 'sel' : ''}`} onClick={() => setRole(null)}>なし</button>
          <button className={`shift-role-btn op ${role === 'open' ? 'sel' : ''}`} onClick={() => setRole('open')}>OP（オープン）</button>
          <button className={`shift-role-btn cl ${role === 'close' ? 'sel' : ''}`} onClick={() => setRole('close')}>CL（クローズ）</button>
        </div>

        <div className="modal-btns" style={{ marginTop: 12 }}>
          {existing && (
            <button className="modal-btn danger" onClick={remove} disabled={busy}>休みにする</button>
          )}
          <button className="modal-btn" onClick={onClose} disabled={busy}>キャンセル</button>
          <button className="modal-btn ok" onClick={save} disabled={busy}>保存</button>
        </div>
      </div>
    </div>
  )
}
