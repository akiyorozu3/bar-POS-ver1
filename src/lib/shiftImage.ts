// シフト表を「画面のスクショ」ではなく、表全体をきれいなPNG画像にして共有する。
// html2canvas で専用のオフスクリーンDOMを画像化 → Web Share API（不可ならダウンロード）。
// サーバー不要。将来のPhase 2（LINE自動送信）とも地続き。
import type { Cast, ScheduledShift } from '@/types'
import { castLabel } from '@/lib/cast'
import { ymd, dayLabel, weekRangeLabel } from '@/lib/week'

interface Params {
  monday: Date
  dates: Date[]
  casts: Cast[]                       // 表示順・在籍のみ
  shifts: ScheduledShift[]
  nameOf: (castId: string) => string  // castId → 表示名
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// オフスクリーンに組み立てるクリーンな表（アプリCSSに依存しないよう全てインライン）
function buildNode(p: Params): HTMLElement {
  const { dates, casts, shifts } = p
  const td = 'border:1px solid #d0cdc5;padding:6px 8px;text-align:center;white-space:nowrap;font-size:14px;'
  const th = td + 'background:#efece6;font-weight:700;'
  const nameCell = 'border:1px solid #d0cdc5;padding:6px 10px;text-align:left;font-weight:700;background:#efece6;font-size:14px;'

  const dayShiftsOf = (ds: string) => shifts.filter((s) => s.date === ds)
  const roleBadge = (r: 'open' | 'close' | null) =>
    r === 'open' ? '<span style="margin-left:4px;font-size:10px;font-weight:700;color:#1f7a3d;">OP</span>'
    : r === 'close' ? '<span style="margin-left:4px;font-size:10px;font-weight:700;color:#a32d2d;">CL</span>'
    : ''

  // ヘッダー行
  const head = `<tr><th style="${nameCell}">キャスト</th>${
    dates.map((d) => `<th style="${th}">${dayLabel(d)}</th>`).join('')
  }<th style="${th}">回数</th></tr>`

  // キャスト行
  const body = casts.map((c) => {
    let count = 0
    const cells = dates.map((d) => {
      const ds = ymd(d)
      const s = shifts.find((x) => x.castId === c.id && x.date === ds)
      if (!s) return `<td style="${td}color:#bbb;">—</td>`
      count++
      return `<td style="${td}background:#f4f8ff;">${esc(s.startTime)}〜${esc(s.endTime)}${roleBadge(s.role)}</td>`
    }).join('')
    return `<tr><th style="${nameCell}">${esc(castLabel(c))}</th>${cells}<td style="${td}font-weight:700;">${count}</td></tr>`
  }).join('')

  // OP / CL 担当行
  const footRow = (role: 'open' | 'close', label: string) => {
    const cells = dates.map((d) => {
      const ds = ymd(d)
      const day = dayShiftsOf(ds)
      const picks = day.filter((s) => s.role === role)
      const missing = day.length > 0 && picks.length === 0
      const text = picks.length ? picks.map((s) => esc(p.nameOf(s.castId))).join('・') : (day.length ? '⚠未定' : '—')
      const bg = missing ? 'background:#fdf2d0;color:#8a6d1a;font-weight:700;' : 'background:#faf9f6;'
      return `<td style="${td}${bg}">${text}</td>`
    }).join('')
    return `<tr><th style="${nameCell}">${label}</th>${cells}<td style="${td}background:#faf9f6;"></td></tr>`
  }

  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:18px 20px;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a18;'
  wrap.innerHTML =
    `<div style="font-size:18px;font-weight:700;margin-bottom:10px;">シフト表　${esc(weekRangeLabel(p.monday))}</div>` +
    `<table style="border-collapse:collapse;">${head}${body}${footRow('open', 'OP担当')}${footRow('close', 'CL担当')}</table>`
  return wrap
}

function downloadBlob(blob: Blob, fname: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fname
  a.click()
  URL.revokeObjectURL(url)
}

// 画像化して共有（共有シートが使えなければダウンロードにフォールバック）
export async function shareShiftImage(p: Params): Promise<void> {
  const node = buildNode(p)
  document.body.appendChild(node)
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像化に失敗しました'))), 'image/png')
    )
    const fname = `shift_${ymd(p.dates[0])}.png`
    const file = new File([blob], fname, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'シフト表', text: `シフト表 ${weekRangeLabel(p.monday)}` })
      } catch (e) {
        // 共有キャンセルは無視。それ以外はダウンロードで救済。
        if ((e as Error)?.name !== 'AbortError') downloadBlob(blob, fname)
      }
    } else {
      downloadBlob(blob, fname)
    }
  } finally {
    document.body.removeChild(node)
  }
}
