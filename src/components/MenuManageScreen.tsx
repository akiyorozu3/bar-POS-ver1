import { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { toTaxInc } from '@/lib/tax'
import { MENU_CATEGORIES } from '@/lib/defaultMenus'
import type { MenuItem } from '@/types'

type AddCategory = typeof MENU_CATEGORIES[number] | '本日限定'

export default function MenuManageScreen() {
  const { menus, menusLoading, addMenu, seedDefaultMenus } = usePosStore()

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState<AddCategory>('ウイスキー')
  const [busy, setBusy] = useState(false)

  const handleAdd = async () => {
    const priceNum = parseInt(price, 10)
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum <= 0) return
    setBusy(true)
    try {
      const isToday = category === '本日限定'
      const sortOrder = menus.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1
      await addMenu({
        name: name.trim(),
        priceExTax: priceNum,
        category: isToday ? '本日限定' : category,
        isToday,
        sortOrder,
      })
      setName('')
      setPrice('')
    } finally {
      setBusy(false)
    }
  }

  const handleSeed = async () => {
    setBusy(true)
    try {
      await seedDefaultMenus()
    } finally {
      setBusy(false)
    }
  }

  if (menusLoading) return <div className="loading">読み込み中...</div>

  const todayMenus = menus.filter((m) => m.isToday)
  const groups = MENU_CATEGORIES.map((cat) => ({
    cat,
    items: menus.filter((m) => !m.isToday && m.category === cat),
  }))

  return (
    <div className="menu-manage">
      <div className="mm-top">
        <span className="mm-title">メニュー管理</span>
        {menus.length === 0 && (
          <button className="mm-seed-btn" onClick={handleSeed} disabled={busy}>
            デフォルトメニューを投入
          </button>
        )}
      </div>

      <div className="mm-body">
        {/* 追加フォーム */}
        <div className="mm-add">
          <div className="mm-add-title">メニューを追加</div>
          <div className="mm-add-row">
            <select
              className="mm-add-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as AddCategory)}
            >
              {MENU_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              <option value="本日限定">本日限定</option>
            </select>
            <input
              className="mm-add-name"
              placeholder="メニュー名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="mm-add-price"
              type="number"
              min="0"
              placeholder="税抜"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <button className="mm-add-btn" onClick={handleAdd} disabled={busy}>＋ 追加</button>
          </div>
          {price !== '' && parseInt(price, 10) > 0 && (
            <div className="mm-add-hint">税込 ¥{toTaxInc(parseInt(price, 10)).toLocaleString()}</div>
          )}
        </div>

        {menus.length === 0 && (
          <div className="mm-empty">
            メニューがまだありません。<br />
            「デフォルトメニューを投入」で初期メニューを登録できます。
          </div>
        )}

        {/* 本日限定 */}
        {todayMenus.length > 0 && (
          <div className="mm-group">
            <div className="mm-group-title today">本日限定</div>
            {todayMenus.map((m) => <MenuRow key={m.id} menu={m} />)}
          </div>
        )}

        {/* カテゴリ別 */}
        {groups.map(({ cat, items }) => items.length > 0 && (
          <div className="mm-group" key={cat}>
            <div className="mm-group-title">{cat}</div>
            {items.map((m) => <MenuRow key={m.id} menu={m} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 1行（インライン編集 + 削除） ─────────────────
function MenuRow({ menu }: { menu: MenuItem }) {
  const { updateMenu, deleteMenu } = usePosStore()
  const [name, setName] = useState(menu.name)
  const [price, setPrice] = useState(String(menu.priceExTax))
  const [busy, setBusy] = useState(false)

  const priceNum = parseInt(price, 10)
  const dirty = name.trim() !== menu.name || (Number.isFinite(priceNum) && priceNum !== menu.priceExTax)
  const valid = name.trim().length > 0 && Number.isFinite(priceNum) && priceNum > 0

  const handleSave = async () => {
    if (!dirty || !valid) return
    setBusy(true)
    try {
      await updateMenu(menu.id, { name: name.trim(), priceExTax: priceNum })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`「${menu.name}」を削除しますか？`)) return
    setBusy(true)
    try {
      await deleteMenu(menu.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mm-row">
      <input className="mm-row-name" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className="mm-row-price"
        type="number"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <span className="mm-row-inc">税込 ¥{Number.isFinite(priceNum) ? toTaxInc(priceNum).toLocaleString() : '—'}</span>
      <button className="mm-row-save" onClick={handleSave} disabled={!dirty || !valid || busy}>保存</button>
      <button className="mm-row-del" onClick={handleDelete} disabled={busy}>削除</button>
    </div>
  )
}
