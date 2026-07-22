// 診断：指定キャスト・指定営業日のバックを、useSalesSummary と同じロジックで1明細ずつ再現する（読み取り専用）。
// 使い方: node scripts/diag-cast-back.mjs .env るん 2026-07-09
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
const envPath = process.argv[2] || '.env'
const TARGET = process.argv[3] || 'るん'
const DATE = process.argv[4] || '2026-07-09'
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
const H = 17
const dateStrOf = (ts) => { const d = new Date(ts - H * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const DRINK = 'キャストドリンク'

async function main() {
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, 'password')
  const backDoc = await getDoc(doc(db, 'settings', 'back'))
  const { rate: backRate = 0, drinkRate = 0 } = backDoc.exists() ? backDoc.data() : {}
  // メニュー名→円バック（「正しい額」の参照用）
  const menus = await getDocs(collection(db, 'menus'))
  const menuBack = new Map()
  menus.forEach((d) => { const m = d.data(); if (m.category === DRINK && m.drinkBack != null) menuBack.set(m.name, m.drinkBack) })

  console.log(`対象: ${TARGET} / ${DATE}  (卓バック率=${backRate*100}%  ドリンクバック率=${drinkRate*100}%)`)
  const snap = await getDocs(collection(db, 'transactions'))
  let tableBackSum = 0, drinkBackNow = 0, drinkBackCorrect = 0
  const rows = []
  snap.forEach((docu) => {
    const t = docu.data()
    if (dateStrOf(t.completedAt) !== DATE) return
    const tableCasts = (t.tableCasts || []).filter(Boolean)
    // ① 卓バック（tableCasts に TARGET が含まれ、かつ最低会計額以上のとき頭割りで付与）
    if (tableCasts.includes(TARGET) && t.total >= (t.backThreshold ?? 0)) {
      const share = (t.total * backRate) / tableCasts.length
      tableBackSum += share
      rows.push({ 卓: t.seatName, 種別: '卓バック', 卓担当: tableCasts.join('・'), 明細: `${t.total}×${backRate*100}%/${tableCasts.length}人`, 現状: Math.round(share), 正しい: Math.round(share) })
    }
    // ② ドリンクバック（item.cast === TARGET のキャストドリンク）
    for (const it of (t.items || [])) {
      if (it.category !== DRINK || (it.cast || '') !== TARGET) continue
      const amt = it.priceExTax * it.qty
      const now = it.drinkBack != null ? it.drinkBack * it.qty : amt * drinkRate
      const correct = it.drinkBack != null ? it.drinkBack * it.qty : (menuBack.has(it.name) ? menuBack.get(it.name) * it.qty : amt * drinkRate)
      const at40 = it.drinkBack != null ? it.drinkBack * it.qty : amt * 0.40   // もし率40%なら
      drinkBackNow += now; drinkBackCorrect += correct
      rows.push({ 卓: t.seatName, 種別: 'ドリンク', 卓担当: tableCasts.join('・') || '(なし)', 明細: `${it.name}×${it.qty} drinkBack=${it.drinkBack ?? 'なし'}`, 現状率0: Math.round(now), 率40なら: Math.round(at40), 正しい円: Math.round(correct) })
    }
  })
  console.table(rows)
  console.log(`卓バック合計: ¥${Math.round(tableBackSum)}`)
  console.log(`ドリンクバック  現状: ¥${Math.round(drinkBackNow)}  / 正しい(円バック): ¥${Math.round(drinkBackCorrect)}`)
  console.log(`バック総額  現状: ¥${Math.round(tableBackSum + drinkBackNow)}  / 正しい: ¥${Math.round(tableBackSum + drinkBackCorrect)}  / 差: ¥${Math.round(drinkBackCorrect - drinkBackNow)}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
