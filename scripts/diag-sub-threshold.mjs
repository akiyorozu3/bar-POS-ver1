// 診断：指定月で、税込合計が閾値未満なのに卓バックが付いている取引を洗い出す（読み取り専用）。
// 使い方: node scripts/diag-sub-threshold.mjs .env 2026-07 5000
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
const env = Object.fromEntries(
  readFileSync(process.argv[2] || '.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const MONTH = process.argv[3] || '2026-07'
const THRESHOLD = parseInt(process.argv[4] || '5000', 10)
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app), auth = getAuth(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'
const H = 17
const dateStrOf = (ts) => { const d = new Date(ts - H * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
async function main() {
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, 'password')
  const backDoc = await getDoc(doc(db, 'settings', 'back'))
  const backRate = backDoc.exists() ? (backDoc.data().rate ?? 0) : 0
  const snap = await getDocs(collection(db, 'transactions'))
  const rows = []
  let sumBack = 0
  snap.forEach((docu) => {
    const t = docu.data()
    const bday = dateStrOf(t.completedAt)
    if (!bday.startsWith(MONTH)) return
    const tableCasts = (t.tableCasts || []).filter(Boolean)
    if (tableCasts.length === 0) return          // 卓担当なし＝そもそも卓バックなし
    if (t.total >= THRESHOLD) return             // 閾値以上＝対象外
    const already = t.backThreshold ?? 0
    if (t.total < already) return                // 既に閾値を焼き付けて卓バックが外れている
    const back = Math.round(t.total * backRate)
    sumBack += back
    rows.push({ 日: bday.slice(5), 卓: t.seatName, 税込合計: t.total, 卓担当: tableCasts.join('・'),
      卓バック: back, 焼付閾値: already })
  })
  rows.sort((a, b) => a.日.localeCompare(b.日))
  console.log(`${MONTH} / 閾値¥${THRESHOLD}未満で卓バックが付いている取引  (卓バック率=${backRate*100}%)`)
  console.table(rows.length ? rows : [{ info: '該当なし' }])
  console.log(`該当 ${rows.length}件 / 付いている卓バック合計 ¥${sumBack.toLocaleString()}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
