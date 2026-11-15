// 診断：指定営業日の大入を分解する（読み取り専用）。
//   売上合計／原資(pool)／担当あり売上の合計／担当なし売上／各キャストの大入／合計 を表示。
//   「合計が2万/3万に届かない」原因（担当未設定で原資が蒸発）を数字で確認する。
// 使い方: OWNER_PW='...' node scripts/diag-oiri-day.mjs .env 2026-11-13
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env'
const DATE = process.argv[3] || '2026-11-13'
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app), auth = getAuth(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'
const OWNER_PW = process.env.OWNER_PW
if (!OWNER_PW) { console.error('OWNER_PW を指定して実行してください'); process.exit(1) }
const H = 17
const dateStrOf = (ts) => { const d = new Date(ts - H * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const DRINK = 'キャストドリンク'

function oiriConfigOn(tiers, dateStr) { let b = null; for (const t of tiers) if (t.from <= dateStr && (!b || t.from > b.from)) b = t; return b }
function oiriPool(total, cfg) { if (!cfg) return 0; if (total >= cfg.tier2Threshold) return cfg.tier2Amount; if (total >= cfg.tier1Threshold) return cfg.tier1Amount; return 0 }

async function main() {
  console.log(`対象: ${env.VITE_FIREBASE_PROJECT_ID} / ${DATE}`)
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, OWNER_PW)
  const osnap = await getDoc(doc(db, 'settings', 'oiri'))
  const tiers = osnap.exists() && Array.isArray(osnap.data().tiers) ? osnap.data().tiers : []
  const cfg = oiriConfigOn(tiers, DATE)

  const txs = []
  ;(await getDocs(collection(db, 'transactions'))).forEach((d) => { const t = d.data(); if (t.completedAt && dateStrOf(t.completedAt) === DATE) txs.push(t) })
  const dayTotal = txs.reduce((a, t) => a + (t.total || 0), 0)
  const pool = oiriPool(dayTotal, cfg)

  // 現行ロジックと同じ perCastSales
  const perCastSales = new Map()
  const add = (n, a) => perCastSales.set(n, (perCastSales.get(n) ?? 0) + a)
  let assignedTableTotal = 0, unassignedTableTotal = 0
  for (const t of txs) {
    const tableCasts = (t.tableCasts || []).filter(Boolean)
    if (tableCasts.length > 0) { assignedTableTotal += t.total; const s = t.total / tableCasts.length; for (const c of tableCasts) add(c, s) }
    else unassignedTableTotal += t.total
    for (const it of (t.items || [])) { if (it.category === DRINK && it.cast) add(it.cast, it.priceExTax * it.qty) }
  }
  const sumPerCast = [...perCastSales.values()].reduce((a, b) => a + b, 0)

  console.log(`\n売上合計(dayTotal): ¥${Math.round(dayTotal).toLocaleString()}`)
  console.log(`有効な大入設定: ${cfg ? cfg.from + '〜' : 'なし'}  → 原資(pool): ¥${pool.toLocaleString()}`)
  console.log(`担当ありの卓売上: ¥${Math.round(assignedTableTotal).toLocaleString()}`)
  console.log(`担当なしの卓売上: ¥${Math.round(unassignedTableTotal).toLocaleString()}  ← これが原資を蒸発させる分`)
  console.log(`perCastSales合計(分子の合計): ¥${Math.round(sumPerCast).toLocaleString()}`)

  // 現行の配分：pool × sales / dayTotal を四捨五入して合計
  let curTotal = 0
  const rows = [...perCastSales.entries()].sort((a,b)=>b[1]-a[1]).map(([name, sales]) => {
    const now = Math.round((pool * sales) / dayTotal)        // 現行（分母=dayTotal）
    const fix = Math.round((pool * sales) / sumPerCast)      // 修正案（分母=担当売上合計）
    curTotal += now
    return { キャスト: name, 売上: `¥${Math.round(sales).toLocaleString()}`, 現行大入: `¥${now.toLocaleString()}`, 満額山分け案: `¥${fix.toLocaleString()}` }
  })
  console.table(rows)
  console.log(`現行の大入合計: ¥${curTotal.toLocaleString()}  （原資 ¥${pool.toLocaleString()} との差: ¥${(pool - curTotal).toLocaleString()}）`)
  console.log('→ 差の正体＝担当なし売上ぶんの原資。満額山分け案なら合計はほぼ ¥' + pool.toLocaleString() + ' になる。')
  process.exit(0)
}
main().catch((e) => { console.error('ERROR:', e.code || e.message); process.exit(1) })
