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
  const [showWage, setShowWage] = useState(false)
  const active = cast.active !== false  // 未設定/true=在籍
  const hasWageHistory = !!(cast.wageHistory && cast.wageHistory.length)

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

  const withholding = !!cast.withholding   // 源泉徴収する
  const backOn = !cast.noBack              // バック集計する
  const toggle = async (patch: { active?: boolean; withholding?: boolean; noBack?: boolean }) => {
    setBusy(true)
    try { await updateCast(cast.id, patch) } finally { setBusy(false) }
  }

  return (
    <div className={`mm-row-wrap ${active ? '' : 'inactive'}`}>
      <div className="mm-row">
        <span className="cast-move">
          <button className="cast-move-btn" onClick={() => moveCast(cast.id, -1)} disabled={isFirst || busy} title="上へ" aria-label="上へ">▲</button>
          <button className="cast-move-btn" onClick={() => moveCast(cast.id, 1)} disabled={isLast || busy} title="下へ" aria-label="下へ">▼</button>
        </span>
        <input className="mm-row-name" placeholder="ニックネーム" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="mm-row-name" placeholder="本名" value={realName} onChange={(e) => setRealName(e.target.value)} />
        <span className="cast-wage-wrap">
          <input className="cast-wage-input" type="number" min="0" placeholder="時給" value={wage} onChange={(e) => setWage(e.target.value)} disabled={hasWageHistory} title={hasWageHistory ? '時給変更履歴あり。「時給変更」から編集してください' : ''} />
          <span className="cast-wage-unit">円/h</span>
        </span>
        <button className="mm-row-save" onClick={handleSave} disabled={!dirty || !valid || busy}>保存</button>
        <button className="mm-row-del" onClick={handleDelete} disabled={busy}>削除</button>
      </div>
      <div className="mm-flags">
        <button className={`cast-flag-btn ${active ? 'on' : 'off'}`} onClick={() => toggle({ active: !active })} disabled={busy} title="シフト表に出す/出さない">
          {active ? '在籍' : '在籍外'}
        </button>
        <button className={`cast-flag-btn ${withholding ? 'on' : 'off'}`} onClick={() => toggle({ withholding: !withholding })} disabled={busy} title="源泉徴収する/しない">
          源泉{withholding ? 'あり' : 'なし'}
        </button>
        <button className={`cast-flag-btn ${backOn ? 'on' : 'off'}`} onClick={() => toggle({ noBack: backOn })} disabled={busy} title="バック集計する/しない">
          バック{backOn ? 'あり' : 'なし'}
        </button>
        <button className={`cast-flag-btn ${hasWageHistory ? 'on' : ''}`} onClick={() => setShowWage(true)} title="時給の変更（この日から◯円）">
          時給変更{hasWageHistory ? `（${cast.wageHistory!.length}件）` : ''}
        </button>
      </div>
      {showWage && <WageModal cast={cast} onClose={() => setShowWage(false)} />}
    </div>
  )
}

// ── 時給の変更履歴モーダル（この日から◯円。過去は旧時給のまま） ───
function WageModal({ cast, onClose }: { cast: Cast; onClose: () => void }) {
  const { updateCast } = usePosStore()
  const [from, setFrom] = useState('')
  const [wage, setWage] = useState('')
  const [busy, setBusy] = useState(false)
  const hist = [...(cast.wageHistory ?? [])].sort((a, b) => a.from.localeCompare(b.from))

  const apply = async () => {
    const w = parseInt(wage, 10)
    if (!from || !Number.isFinite(w) || w < 0) return
    setBusy(true)
    try {
      // 履歴が無ければ、現在の時給を「ずっと前から」の分として埋めてから追加（過去を旧時給に保つ）
      let next = cast.wageHistory && cast.wageHistory.length
        ? [...cast.wageHistory]
        : [{ from: '2000-01-01', wage: cast.hourlyWage ?? 0 }]
      next = next.filter((h) => h.from !== from)
      next.push({ from, wage: w })
      next.sort((a, b) => a.from.localeCompare(b.from))
      await updateCast(cast.id, { wageHistory: next, hourlyWage: next[next.length - 1].wage })
      setFrom(''); setWage('')
    } finally { setBusy(false) }
  }
  const remove = async (f: string) => {
    setBusy(true)
    try {
      const next = (cast.wageHistory ?? []).filter((h) => h.from !== f)
      await updateCast(cast.id, {
        wageHistory: next,
        ...(next.length ? { hourlyWage: [...next].sort((a, b) => a.from.localeCompare(b.from)).slice(-1)[0].wage } : {}),
      })
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">時給の変更　{cast.name || cast.realName}</div>
        <div style={{ fontSize: 11, color: '#888780', marginBottom: 8 }}>
          「この日から◯円」を追加します。指定日より前の出勤は変更前の時給のまま計算されます。
        </div>
        <label>適用開始日</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>新しい時給（円/h）</label>
        <input type="number" min="0" placeholder="例：3500" value={wage} onChange={(e) => setWage(e.target.value)} />
        <button className="modal-btn ok" style={{ width: '100%', margin: '8px 0' }} onClick={apply} disabled={busy || !from || !wage}>＋ この日から適用</button>

        <div style={{ fontSize: 10, color: '#888780', marginBottom: 5 }}>登録済みの時給（{hist.length}件）</div>
        <div className="today-menu-list">
          {hist.length === 0
            ? <p style={{ fontSize: 11, color: '#888780' }}>履歴なし（現在の時給 ¥{(cast.hourlyWage ?? 0).toLocaleString()} が全期間に適用）</p>
            : hist.map((h) => (
              <div key={h.from} className="today-menu-row">
                <span className="tm-name">{h.from.replace(/-/g, '/')} 〜</span>
                <span className="tm-price">¥{h.wage.toLocaleString()}/h</span>
                <button className="tm-del" onClick={() => remove(h.from)} disabled={busy}>削除</button>
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
