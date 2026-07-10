// 診断：キャストドリンク系メニューの drinkBack 設定と、ドリンクバック率を確認（読み取りのみ）。
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
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
  const back = await getDoc(doc(db, 'settings', 'back'))
  console.log('settings/back:', back.exists() ? back.data() : '(なし)')
  const snap = await getDocs(collection(db, 'menus'))
  const rows = []
  snap.forEach((d) => {
    const m = d.data()
    if (m.category !== 'キャストドリンク') return
    rows.push({ name: m.name, price: m.priceExTax,
      drinkBack: Object.prototype.hasOwnProperty.call(m, 'drinkBack') ? m.drinkBack : '⚠未設定(率計算になる)' })
  })
  console.table(rows)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
