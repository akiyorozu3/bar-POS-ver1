import { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { displayUnit, calcBill } from '@/lib/tax'
import { castLabel } from '@/lib/cast'
import { FREE_PRESETS, MENU_CATEGORIES } from '@/lib/defaultMenus'
import type { MenuItem } from '@/types'

type Tab = typeof MENU_CATEGORIES[number] | '本日限定' | 'フリー入力'

export default function OrderScreen() {
  const {
    seats, currentSeatId, orders,
    addSeat, updateSeat, setCurrentSeat,
    menus, casts, addOrderItem, changeQty, changeItemCast, clearOrder, setTableCasts,
    taxRate, taxMode, tableNames, role,
  } = usePosStore()
  const isOwner = role === 'owner'

  const [tab, setTab] = useState<Tab>('セット')
  const [showTodayModal, setShowTodayModal] = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [freeName, setFreeName] = useState('')
  const [freePrice, setFreePrice] = useState('')
  const [discount, setDiscount] = useState('')

  const taxIncluded = taxMode === 'inclusive'
  const taxPct = Math.round(taxRate * 100)

  const seat = seats.find((s) => s.id === currentSeatId)
  const currentOrder = currentSeatId ? (orders[currentSeatId] ?? []) : []

  const base = currentOrder.reduce((s, x) => s + x.priceExTax * x.qty, 0)
  const { subtotal, tax: taxAmt, total: totalAmt } = calcBill(base, taxRate, taxMode)

  const todayMenus = menus.filter((m) => m.isToday)
  const tabMenus: MenuItem[] =
    tab === '本日限定' ? todayMenus :
    tab === 'フリー入力' ? [] :
    menus.filter((m) => m.category === tab && !m.isToday)

  const handleAddItem = (m: MenuItem) => {
    if (!currentSeatId) return
    addOrderItem(currentSeatId, {
      name: m.name,
      priceExTax: m.priceExTax,
      qty: 1,
      cast: '',
      category: m.category,
      isToday: m.isToday,
      isFree: false,
    })
  }

  const handleAddFree = () => {
    if (!currentSeatId || !freeName || !freePrice) return
    addOrderItem(currentSeatId, {
      name: freeName,
      priceExTax: parseInt(freePrice),
      qty: 1,
      cast: '',
      category: 'フリー入力',
      isToday: false,
      isFree: true,
    })
    setFreeName('')
    setFreePrice('')
  }

  // 割引：入力は正の金額、明細にはマイナスで追加する
  const handleAddDiscount = () => {
    if (!currentSeatId || !discount) return
    const amt = Math.abs(parseInt(discount, 10))
    if (!Number.isFinite(amt) || amt === 0) return
    addOrderItem(currentSeatId, {
      name: '割引',
      priceExTax: -amt,
      qty: 1,
      cast: '',
      category: 'フリー入力',
      isToday: false,
      isFree: true,
    })
    setDiscount('')
  }

  const allTabs: Tab[] = ['本日限定', ...MENU_CATEGORIES, 'フリー入力']

  return (
    <div className="order-screen">
      {/* 席バー */}
      <div className="seat-bar">
        {seats.map((s) => (
          <button
            key={s.id}
            className={`seat-chip ${s.id === currentSeatId ? 'active' : ''}`}
            onClick={() => setCurrentSeat(s.id)}
          >
            {s.solo && <span className="solo-dot" />}
            {s.name || `席 ${s.id}`}
          </button>
        ))}
        {/* 定型テーブル（まだ開いていない卓だけワンタップで開く） */}
        {(() => {
          const open = new Set(seats.map((s) => s.name).filter(Boolean))
          return tableNames.filter((n) => !open.has(n)).map((n) => (
            <button key={n} className="seat-chip quick" onClick={() => addSeat(n, false)}>
              {n}
            </button>
          ))
        })()}
        <button className="seat-chip add" onClick={() => addSeat('', false)}>
          ＋ 追加
        </button>
        {isOwner && (
          <button className="seat-chip edit" onClick={() => setShowTableModal(true)}>
            定型編集
          </button>
        )}
      </div>

      <div className="order-body">
        {/* 左：メニュー */}
        <div className="menu-panel">
          {/* カテゴリタブ */}
          <div className="cat-bar">
            {allTabs.map((t) => (
              <button
                key={t}
                className={`cat-chip ${t === tab ? 'active' : ''} ${t === '本日限定' ? 'today' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
            <button className="cat-edit-btn" onClick={() => setShowTodayModal(true)}>
              本日メニュー編集
            </button>
          </div>

          {/* メニューグリッド */}
          {tab === 'フリー入力' ? (
            <div className="free-area">
              <p className="free-title">品名と金額（{taxIncluded ? '税込' : '税抜'}）を入力</p>
              <div className="free-row">
                <input
                  className="free-name-input"
                  placeholder="品名（例：ボトルチャージ）"
                  value={freeName}
                  onChange={(e) => setFreeName(e.target.value)}
                />
                <input
                  className="free-price-input"
                  type="number"
                  placeholder="金額"
                  value={freePrice}
                  onChange={(e) => setFreePrice(e.target.value)}
                />
                <button className="free-add-btn" onClick={handleAddFree}>
                  追加
                </button>
              </div>

              <p className="free-title" style={{ marginTop: 4 }}>割引（金額を入れると明細にマイナスで入ります）</p>
              <div className="free-row">
                <span className="discount-lbl">割引</span>
                <input
                  className="free-price-input"
                  type="number"
                  min="0"
                  placeholder="割引額"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                <button className="free-add-btn discount" onClick={handleAddDiscount}>
                  割引追加
                </button>
              </div>

              <div className="quick-presets">
                {FREE_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    className="quick-preset"
                    onClick={() => {
                      if (!currentSeatId) return
                      addOrderItem(currentSeatId, {
                        name: p.name, priceExTax: p.priceExTax, qty: 1,
                        cast: '', category: 'フリー入力',
                        isToday: false, isFree: true,
                      })
                    }}
                  >
                    {p.name}
                    <br />
                    <span style={{ fontSize: 9, color: 'var(--text-accent)' }}>
                      ¥{displayUnit(p.priceExTax, taxRate, taxMode).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : tab === '本日限定' && todayMenus.length === 0 ? (
            <div className="empty-today">
              本日メニューがまだ登録されていません。
              <br />
              「本日メニュー編集」から追加してください。
            </div>
          ) : tabMenus.length === 0 ? (
            <div className="empty-today">
              「{tab}」のメニューはまだ登録されていません。
              <br />
              オーナーの「メニュー管理」から追加できます。
            </div>
          ) : (
            <div className="menu-grid">
              {tabMenus.map((m) => (
                <button
                  key={m.id}
                  className={`m-item ${m.isToday ? 'today-item' : ''}`}
                  onClick={() => handleAddItem(m)}
                >
                  {m.isToday && <span className="today-tag">本日</span>}
                  <div className="m-name">{m.name}</div>
                  <div className="m-price">¥{displayUnit(m.priceExTax, taxRate, taxMode).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右：伝票 */}
        <div className="ticket">
          <div className="ticket-top">
            <div className="ticket-meta">
              <input
                className="ticket-seat-name"
                placeholder="席の名前（例：田中様）"
                value={seat?.name ?? ''}
                onChange={(e) => seat && updateSeat(seat.id, { name: e.target.value })}
              />
              <button
                className={`solo-toggle ${seat?.solo ? 'on' : ''}`}
                onClick={() => seat && updateSeat(seat.id, { solo: !seat.solo })}
              >
                {seat?.solo ? '一人客 ✓' : '一人客'}
              </button>
            </div>
            <div className="cast-row">
              <span className="cast-lbl">卓の担当</span>
              <div className="table-casts">
                {(() => {
                  const list = seat && seat.tableCasts.length ? seat.tableCasts : ['']
                  return list.map((tc, i) => (
                    <div className="table-cast-item" key={i}>
                      <select
                        className="cast-sel"
                        value={tc}
                        onChange={(e) => {
                          if (!seat) return
                          const next = [...list]; next[i] = e.target.value
                          setTableCasts(seat.id, next)
                        }}
                      >
                        <option value="">担当未設定</option>
                        {casts.map((c) => <option key={c.id}>{castLabel(c)}</option>)}
                      </select>
                      {list.length > 1 && (
                        <button
                          className="cast-remove"
                          onClick={() => seat && setTableCasts(seat.id, list.filter((_, j) => j !== i))}
                          title="この担当を外す"
                        >×</button>
                      )}
                    </div>
                  ))
                })()}
                <button
                  className="cast-add"
                  onClick={() => seat && setTableCasts(seat.id, [...(seat.tableCasts.length ? seat.tableCasts : ['']), ''])}
                  title="担当を追加"
                >＋担当</button>
              </div>
            </div>
          </div>

          <div className="ticket-items">
            {currentOrder.length === 0 ? (
              <p className="ticket-empty">メニューを選んでください</p>
            ) : (
              currentOrder.map((item) => (
                <div key={item.id} className="t-row">
                  <div className="t-row-top">
                    <span className="t-row-name">
                      {item.name}
                      <span className="t-row-qty-label"> ×{item.qty}</span>
                    </span>
                    <span className="t-row-controls">
                      <button className="qb" onClick={() => currentSeatId && changeQty(currentSeatId, item.id, -1)}>−</button>
                      <button className="qb" onClick={() => currentSeatId && changeQty(currentSeatId, item.id, +1)}>＋</button>
                    </span>
                    <span className={`t-row-price ${item.priceExTax < 0 ? 'minus' : ''}`}>
                      ¥{(item.priceExTax * item.qty).toLocaleString()}
                    </span>
                  </div>
                  {item.category === 'キャストドリンク' && (
                    <div className="t-cast-row">
                      <span className="t-cast-lbl">ドリンク担当：</span>
                      <select
                        className="t-cast-sel"
                        value={item.cast}
                        onChange={(e) => currentSeatId && changeItemCast(currentSeatId, item.id, e.target.value)}
                      >
                        <option value="">未設定</option>
                        {casts.map((c) => <option key={c.id}>{castLabel(c)}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="ticket-foot">
            {!taxIncluded && (
              <>
                <div className="foot-line">
                  <span className="foot-lbl">小計 (税抜)</span>
                  <span className="foot-val">¥{subtotal.toLocaleString()}</span>
                </div>
                <div className="foot-line">
                  <span className="foot-lbl">消費税 ({taxPct}%)</span>
                  <span className="foot-val">¥{taxAmt.toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="total-line">
              <span className="total-lbl">合計{taxIncluded ? '' : ' (税込)'}</span>
              <span className="total-val">¥{totalAmt.toLocaleString()}</span>
            </div>
            <div className="foot-btns">
              <button className="btn-secondary" onClick={() => currentSeatId && clearOrder(currentSeatId)}>
                クリア
              </button>
              <button
                className="btn-primary"
                onClick={() => {/* CheckoutScreenへ遷移はApp.tsxで管理 */
                  document.dispatchEvent(new CustomEvent('pos:go-checkout'))
                }}
              >
                会計へ →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 本日メニュー管理モーダルは TodayMenuModal.tsx に分離 */}
      {showTodayModal && (
        <TodayMenuModal onClose={() => setShowTodayModal(false)} />
      )}
      {showTableModal && (
        <TableNamesModal onClose={() => setShowTableModal(false)} />
      )}
    </div>
  )
}

// ── 定型テーブル名の編集モーダル ─────────────────
function TableNamesModal({ onClose }: { onClose: () => void }) {
  const { tableNames, saveTableNames } = usePosStore()
  const [names, setNames] = useState<string[]>(tableNames)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const add = () => {
    const v = input.trim()
    if (!v || names.includes(v)) { setInput(''); return }
    setNames([...names, v])
    setInput('')
  }
  const remove = (n: string) => setNames(names.filter((x) => x !== n))

  const handleSave = async () => {
    setBusy(true)
    try { await saveTableNames(names); onClose() } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">定型テーブルの編集</div>
        <label>テーブル名を追加（例：C1）</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            style={{ flex: 1, marginBottom: 0 }}
            placeholder="例：C1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
          <button className="modal-btn ok" style={{ flex: 'none', width: 64 }} onClick={add}>＋</button>
        </div>
        <div className="table-names-list">
          {names.length === 0
            ? <p style={{ fontSize: 11, color: '#888780' }}>まだありません。よく使う卓名を追加してください。</p>
            : names.map((n) => (
              <div key={n} className="table-name-row">
                <span>{n}</span>
                <button className="tm-del" onClick={() => remove(n)}>削除</button>
              </div>
            ))}
        </div>
        <div className="modal-btns" style={{ marginTop: 10 }}>
          <button className="modal-btn" onClick={onClose}>キャンセル</button>
          <button className="modal-btn ok" onClick={handleSave} disabled={busy}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── 本日メニュー管理モーダル ─────────────────────
function TodayMenuModal({ onClose }: { onClose: () => void }) {
  const { menus, addMenu, deleteMenu, taxRate, taxMode } = usePosStore()
  const taxIncluded = taxMode === 'inclusive'
  const todayMenus = menus.filter((m) => m.isToday)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)

  const handleAdd = async () => {
    const priceNum = parseInt(price, 10)
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum <= 0) return
    setBusy(true)
    try {
      const sortOrder = menus.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1
      await addMenu({
        name: name.trim(),
        priceExTax: priceNum,
        category: '本日限定',
        isToday: true,
        sortOrder,
      })
      setName('')
      setPrice('')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    setBusy(true)
    try {
      await deleteMenu(id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">本日のメニュー</div>
        <label>メニュー名</label>
        <input placeholder="例：本日のおすすめカクテル" value={name} onChange={(e) => setName(e.target.value)} />
        <label>価格（{taxIncluded ? '税込' : '税抜'}）</label>
        <input type="number" min="0" placeholder="例：800" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button
          className="modal-btn ok"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={handleAdd}
          disabled={busy}
        >
          ＋ 追加
        </button>
        <div style={{ fontSize: 10, color: '#888780', marginBottom: 5 }}>
          登録済み（{todayMenus.length}件）
        </div>
        <div className="today-menu-list">
          {todayMenus.length === 0
            ? <p style={{ fontSize: 11, color: '#888780' }}>まだ登録されていません</p>
            : todayMenus.map((m) => (
              <div key={m.id} className="today-menu-row">
                <span className="tm-name">{m.name}</span>
                <span className="tm-price">¥{displayUnit(m.priceExTax, taxRate, taxMode).toLocaleString()}</span>
                <button className="tm-del" onClick={() => handleDelete(m.id)} disabled={busy}>削除</button>
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
