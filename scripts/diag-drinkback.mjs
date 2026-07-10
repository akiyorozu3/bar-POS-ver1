// 診断：指定営業日のキャストドリンク明細に drinkBack が記録されているか確認する（読み取りのみ）。
// 使い方: node scripts/diag-drinkback.mjs .env 2026-07-07 2026-07-08
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env'
const targetDates = process.argv.slice(3)
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'
const BUSINESS_DAY_START_HOUR = 17
const dateStrOf = (ts) => {
  const d = new Date(ts - BUSINESS_DAY_START_HOUR * 3600 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  console.log(`プロジェクト: ${env.VITE_FIREBASE_PROJECT_ID} / 対象日: ${targetDates.join(', ') || '(全日)'}`)
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, 'password')
  const snap = await getDocs(collection(db, 'transactions'))
  const rows = []
  snap.forEach((doc) => {
    const t = doc.data()
    const bday = dateStrOf(t.completedAt)
    if (targetDates.length && !targetDates.includes(bday)) return
    for (const it of (t.items || [])) {
      if (it.category !== 'キャストドリンク') continue
      rows.push({ bday, seat: t.seatName, name: it.name, cast: it.cast || '(未設定)', qty: it.qty,
        drinkBack: Object.prototype.hasOwnProperty.call(it, 'drinkBack') ? it.drinkBack : '⚠なし',
        卓バック: (t.tableCasts && t.tableCasts.filter(Boolean).length) ? t.tableCasts.filter(Boolean).join('・') : '(なし)' })
    }
  })
  rows.sort((a, b) => a.bday.localeCompare(b.bday))
  console.table(rows)
  console.log(`キャストドリンク明細: ${rows.length}件 / drinkBack未記録: ${rows.filter(r => r.drinkBack === '⚠なし(率計算)').length}件`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
