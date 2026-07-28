import { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import type { Cast } from '@/types'

export default function CastManageScreen() {
  const { casts, castsLoading, addCast, seedDefaultCasts } = usePosStore()

  const [name, setName] = useState('')
  const [realName, setRealName] = useState('')
  const [wage, setWage] = useState('')
  const [busy, setBusy] = useState(false)

  // ニックネーム・本名のどちらか一方が入っていればOK
  const canAdd = name.trim().length > 0 || realName.trim().length > 0

  const handleAdd = async () => {
    if (!canAdd) return
    setBusy(true)
    try {
      const w = parseInt(wage, 10)
      await addCast(name.trim(), realName.trim(), Number.isFinite(w) && w >= 0 ? w : undefined)
      setName('')
      setRealName('')
      setWage('')
    } finally {
      setBusy(false)
    }
  }

  if (castsLoading) return <div className="loading">読み込み中...</div>

  return (
    <div className="menu-manage">
      <div className="mm-top">
        <span className="mm-title">キャスト管理</span>
        {casts.length === 0 && (
          <button className="mm-seed-btn" onClick={async () => {
            setBusy(true)
            try { await seedDefaultCasts() } finally { setBusy(false) }
          }} disabled={busy}>
            初期キャストを投入
          </button>
        )}
      </div>

      <div className="mm-body">
        {/* 追加フォーム */}
        <div className="mm-add">
          <div className="mm-add-title">キャストを追加（ニックネームか本名のどちらかは必須）</div>
          <div className="mm-add-row">
            <input
              className="mm-add-name"
              placeholder="ニックネーム（源氏名）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
            <input
              className="mm-add-name"
              placeholder="本名"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
            <span className="cast-wage-wrap">
              <input
                className="cast-wage-input"
                type="number"
                min="0"
                placeholder="時給"
                value={wage}
                onChange={(e) => setWage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              <span className="cast-wage-unit">円/h</span>
            </span>
            <button className="mm-add-btn" onClick={handleAdd} disabled={!canAdd || busy}>＋ 追加</button>
          </div>
        </div>

        {casts.length === 0 ? (
          <div className="mm-empty">
            キャストがまだ登録されていません。<br />
            「初期キャストを投入」または上の入力欄から追加してください。
          </div>
        ) : (
          <div className="mm-group">
            <div className="mm-group-title">登録キャスト（{casts.length}名）／並び順は注文の担当選択に反映（シフト表の並びはシフト画面で調整）</div>
            {casts.map((c, i) => (
              <CastRow key={c.id} cast={c} isFirst={i === 0} isLast={i === casts.length - 1} />
            ))}
          </div>
        )}

        <div className="mm-note">
          ※ キャストを削除しても、過去の売上・バック集計には影響しません（記録された担当名はそのまま残ります）。<br />
          ※ 名前を変更した場合、変更後の注文から新しい名前が使われます（過去の記録は元の名前のままです）。
        </div>
      </div>
    </div>
  )
}

// ── 1行（インライン編集 + 並び替え + 在籍 + 削除） ───
function CastRow({ cast, isFirst, isLast }: { cast: Cast; isFirst: boolean; isLast: boolean }) {
  const { updateCast, deleteCast, moveCast } = usePosStore()
  const [name, setName] = useState(cast.name)
  const [realName, setRealName] = useState(cast.realName ?? '')
  const [wage, setWage] = useState(cast.hourlyWage != null ? String(cast.hourlyWage) : '')
  const [busy, setBusy] = useState(false)
  const active = cast.active !== false  // 未設定/true=在籍

  const wageNum = parseInt(wage, 10)
  const wageVal = wage.trim() === '' ? undefined : (Number.isFinite(wageNum) && wageNum >= 0 ? wageNum : undefined)
  const wageChanged = wageVal !== (cast.hourlyWage ?? undefined)
  const dirty = name.trim() !== cast.name || realName.trim() !== (cast.realName ?? '') || wageChanged
  const valid = name.trim().length > 0 || realName.trim().length > 0

  const handleSave = async () => {
    if (!dirty || !valid) return
    setBusy(true)
    try {
      await updateCast(cast.id, { name: name.trim(), realName: realName.trim(), hourlyWage: wageVal ?? 0 })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`「${cast.name || cast.realName}」を削除しますか？`)) return
    setBusy(true)
    try {
      await deleteCast(cast.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`mm-row ${active ? '' : 'inactive'}`}>
      <span className="cast-move">
        <button className="cast-move-btn" onClick={() => moveCast(cast.id, -1)} disabled={isFirst || busy} title="上へ" aria-label="上へ">▲</button>
        <button className="cast-move-btn" onClick={() => moveCast(cast.id, 1)} disabled={isLast || busy} title="下へ" aria-label="下へ">▼</button>
      </span>
      <input className="mm-row-name" placeholder="ニックネーム" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="mm-row-name" placeholder="本名" value={realName} onChange={(e) => setRealName(e.target.value)} />
      <span className="cast-wage-wrap">
        <input className="cast-wage-input" type="number" min="0" placeholder="時給" value={wage} onChange={(e) => setWage(e.target.value)} />
        <span className="cast-wage-unit">円/h</span>
      </span>
      <button
        className={`cast-active-btn ${active ? 'on' : 'off'}`}
        onClick={async () => { setBusy(true); try { await updateCast(cast.id, { active: !active }) } finally { setBusy(false) } }}
        disabled={busy}
        title="シフト表に出す/出さない"
      >
        {active ? '在籍' : '在籍外'}
      </button>
      <button className="mm-row-save" onClick={handleSave} disabled={!dirty || !valid || busy}>保存</button>
      <button className="mm-row-del" onClick={handleDelete} disabled={busy}>削除</button>
    </div>
  )
}
