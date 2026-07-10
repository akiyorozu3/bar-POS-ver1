// 診断：現在開いている卓(tables=会計前の注文)のキャストドリンク明細に drinkBack が
// 焼き付いているか、と メニューの drinkBack を確認（読み取りのみ）。ライブ挙動の確認用。
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
const env = Object.fromEntries(
  readFileSync(process.argv[2] || '.env', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app), auth = getAuth(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'
async function main() {
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, 'password')
  // メニュー（キャストドリンク）
  const menus = await getDocs(collection(db, 'menus'))
  const mrows = []
  menus.forEach((d) => { const m = d.data(); if (m.category === 'キャストドリンク') mrows.push({ id: d.id, name: m.name, price: m.priceExTax, drinkBack: m.drinkBack ?? '⚠未設定', typeof: typeof m.drinkBack }) })
  console.log('=== メニュー（キャストドリンク） ==='); console.table(mrows)
  // 現在の卓（会計前）
  const tables = await getDocs(collection(db, 'tables'))
  const trows = []
  tables.forEach((d) => {
    const t = d.data()
    for (const it of (t.items || [])) {
      if (it.category !== 'キャストドリンク') continue
      trows.push({ 卓: t.name || d.id, name: it.name, cast: it.cast || '(未設定)', qty: it.qty,
        drinkBack: Object.prototype.hasOwnProperty.call(it, 'drinkBack') ? it.drinkBack : '⚠なし' })
    }
  })
  console.log(`=== 現在開いている卓のキャストドリンク（${trows.length}件） ===`)
  console.table(trows.length ? trows : [{ info: '開いている卓にキャストドリンク明細なし' }])
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
