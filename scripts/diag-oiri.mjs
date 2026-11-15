// 診断：大入（おおいり）がなぜ 0 になるのかを実データで切り分ける（読み取り専用）。
//   ① settings/oiri の保存内容（tiers＝適用日・閾値・原資）を表示
//   ② 直近N営業日の「売上合計／その日に有効な設定／原資(pool)／閾値到達か」を一覧
// 使い方: node scripts/diag-oiri.mjs .env 21
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env'
const DAYS = parseInt(process.argv[3] || '21', 10)
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
const OWNER_PW = process.env.OWNER_PW || 'password'
const H = 17 // 営業日の境界（17時始まり）＝ useSalesSummary / oiri と同じ
const dateStrOf = (ts) => { const d = new Date(ts - H * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

function oiriConfigOn(tiers, dateStr) {
  let best = null
  for (const t of tiers) if (t.from <= dateStr && (!best || t.from > best.from)) best = t
  return best
}
function oiriPool(dayTotal, cfg) {
  if (!cfg) return 0
  if (dayTotal >= cfg.tier2Threshold) return cfg.tier2Amount
  if (dayTotal >= cfg.tier1Threshold) return cfg.tier1Amount
  return 0
}

async function main() {
  console.log(`対象プロジェクト: ${env.VITE_FIREBASE_PROJECT_ID}`)
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, OWNER_PW)

  // ① 大入設定
  const snap = await getDoc(doc(db, 'settings', 'oiri'))
  const tiers = snap.exists() && Array.isArray(snap.data().tiers) ? snap.data().tiers : []
  console.log(`\n── 大入設定 settings/oiri ──`)
  if (tiers.length === 0) {
    console.log('⚠️ 設定が空（未保存）。→ 大入は全日 0 になります。原因はコレ。')
  } else {
    for (const t of [...tiers].sort((a,b)=>a.from.localeCompare(b.from)))
      console.log(`  適用日 ${t.from} 以降：  ${t.tier1Threshold.toLocaleString()}超→¥${t.tier1Amount.toLocaleString()} ／ ${t.tier2Threshold.toLocaleString()}超→¥${t.tier2Amount.toLocaleString()}`)
  }

  // ② 直近の営業日ごとの売上合計 → 設定／原資／到達
  const txs = []
  ;(await getDocs(collection(db, 'transactions'))).forEach((d) => { const t = d.data(); if (t.completedAt) txs.push(t) })
  const byDay = new Map()
  for (const t of txs) { const k = dateStrOf(t.completedAt); byDay.set(k, (byDay.get(k) ?? 0) + (t.total || 0)) }
  const days = [...byDay.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0, DAYS)

  console.log(`\n── 直近${days.length}営業日の大入判定 ──`)
  const rows = days.map(([date, total]) => {
    const cfg = oiriConfigOn(tiers, date)
    const pool = oiriPool(total, cfg)
    return {
      営業日: date,
      売上合計: `¥${Math.round(total).toLocaleString()}`,
      有効な設定: cfg ? `${cfg.from}〜` : '（なし＝0）',
      '15万超?': cfg ? (total >= cfg.tier1Threshold ? '○' : '×') : '-',
      '25万超?': cfg ? (total >= cfg.tier2Threshold ? '○' : '×') : '-',
      大入: pool > 0 ? `¥${pool.toLocaleString()}` : '0',
    }
  })
  console.table(rows)
  const hit = rows.filter(r => r.大入 !== '0').length
  console.log(`\n大入が発生した営業日: ${hit} / ${rows.length}`)
  if (tiers.length > 0 && hit === 0) console.log('→ 設定はあるが、直近は「閾値未達」か「設定日より前」で0。上の表の ○/× と 有効な設定 列を確認。')
  process.exit(0)
}
main().catch((e) => { console.error('ERROR:', e.code || e.message); process.exit(1) })
