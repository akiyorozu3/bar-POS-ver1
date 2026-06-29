import { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import type { Cast } from '@/types'

export default function CastManageScreen() {
  const { casts, castsLoading, addCast, seedDefaultCasts } = usePosStore()

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await addCast(name.trim())
      setName('')
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
          <div className="mm-add-title">キャストを追加</div>
          <div className="mm-add-row">
            <input
              className="mm-add-name"
              placeholder="キャスト名（例：さくら）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
            <button className="mm-add-btn" onClick={handleAdd} disabled={busy}>＋ 追加</button>
          </div>
        </div>

        {casts.length === 0 ? (
          <div className="mm-empty">
            キャストがまだ登録されていません。<br />
            「初期キャストを投入」または上の入力欄から追加してください。
          </div>
        ) : (
          <div className="mm-group">
            <div className="mm-group-title">登録キャスト（{casts.length}名）</div>
            {casts.map((c) => <CastRow key={c.id} cast={c} />)}
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

// ── 1行（インライン編集 + 削除） ─────────────────
function CastRow({ cast }: { cast: Cast }) {
  const { updateCast, deleteCast } = usePosStore()
  const [name, setName] = useState(cast.name)
  const [busy, setBusy] = useState(false)

  const dirty = name.trim() !== cast.name
  const valid = name.trim().length > 0

  const handleSave = async () => {
    if (!dirty || !valid) return
    setBusy(true)
    try {
      await updateCast(cast.id, name.trim())
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`「${cast.name}」を削除しますか？`)) return
    setBusy(true)
    try {
      await deleteCast(cast.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mm-row">
      <input className="mm-row-name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="mm-row-save" onClick={handleSave} disabled={!dirty || !valid || busy}>保存</button>
      <button className="mm-row-del" onClick={handleDelete} disabled={busy}>削除</button>
    </div>
  )
}
