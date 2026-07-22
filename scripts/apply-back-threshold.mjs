// 指定月で「税込合計 < 閾値」かつ卓担当ありの取引に backThreshold を後付けし、
// 卓バックだけ外す（担当・売上・ドリンクバックは維持）。
// 使い方:
//   node scripts/apply-back-threshold.mjs .env 2026-07 5000          # ドライラン
//   node scripts/apply-back-threshold.mjs .env 2026-07 5000 --apply  # 反映
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(
  readFileSync(process.argv[2] || '.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const MONTH = process.argv[3] || '2026-07'
const THRESHOLD = parseInt(process.argv[4] || '5000', 10)
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'
const H = 17
const dateStrOf = (ts) => { const d = new Date(ts - H * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
async function main() {
  await signInWithEmailAndPassword(getAuth(app), `owner@${DOMAIN}`, 'password')
  console.log(`接続先: ${env.VITE_FIREBASE_PROJECT_ID}  ${MONTH} 閾値¥${THRESHOLD}  モード: ${APPLY ? '★書き込み' : 'ドライラン'}`)
  const snap = await getDocs(collection(db, 'transactions'))
  let n = 0
  for (const dref of snap.docs) {
    const t = dref.data()
    if (!dateStrOf(t.completedAt).startsWith(MONTH)) continue
    const tableCasts = (t.tableCasts || []).filter(Boolean)
    if (tableCasts.length === 0) continue
    if (t.total >= THRESHOLD) continue
    if ((t.backThreshold ?? 0) >= THRESHOLD) continue  // 既に外れている
    n++
    console.log(`  [${t.seatName}] 税込¥${t.total} 担当${tableCasts.join('・')} → backThreshold=${THRESHOLD}（卓バック外れる・担当は維持）`)
    if (APPLY) await updateDoc(doc(db, 'transactions', dref.id), { backThreshold: THRESHOLD })
  }
  console.log(`\n対象 ${n}件  ${APPLY ? '→ 書き込み完了' : '→ ドライラン（--apply で反映）'}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
