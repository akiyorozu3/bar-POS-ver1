// テスト環境（bar-pos-staging・本物のクラウド）にサンプルデータを投入する。
// 前提: Console で Firestore 作成済み・Auth のメール/パスワードを有効化済みであること。
// 実行:  npm run seed:staging
//
// 設定は .env.staging から読み込む（本番 bar-pos-b1993 には接続しない）。

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, collection } from 'firebase/firestore'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'

const env = Object.fromEntries(
  readFileSync('.env.staging', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

if (env.VITE_FIREBASE_PROJECT_ID !== 'bar-pos-staging') {
  console.error('安全のため中止: .env.staging の projectId が bar-pos-staging ではありません')
  process.exit(1)
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)
const auth = getAuth(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'

async function ensureUser(id, password) {
  const email = `${id}@${DOMAIN}`
  try {
    await createUserWithEmailAndPassword(auth, email, password)
    console.log(`  auth: ${email} を作成`)
  } catch (e) {
    if (String(e.code).includes('email-already-in-use')) console.log(`  auth: ${email} は既に存在`)
    else throw e
  }
}

const MENUS = [
  { name: '2時間セット', priceExTax: 5000, category: 'セット', isToday: false, sortOrder: 1 },
  { name: 'テキーラ', priceExTax: 800, category: 'ショット', isToday: false, sortOrder: 2 },
  { name: 'モエ', priceExTax: 15000, category: 'シャンパン', isToday: false, sortOrder: 3 },
  { name: '生ビール', priceExTax: 700, category: 'ビール', isToday: false, sortOrder: 4 },
  { name: 'キャストドリンク', priceExTax: 1000, category: 'キャストドリンク', isToday: false, sortOrder: 5 },
]
const CASTS = [
  { name: 'りな', realName: '山田梨奈', sortOrder: 1 },
  { name: 'みく', realName: '佐藤未来', sortOrder: 2 },
]

async function main() {
  console.log('サンプルデータ投入中（テスト環境 bar-pos-staging）...')
  console.log('- アカウント')
  await ensureUser('owner', 'password')
  await ensureUser('staff', '000000')

  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, 'password')

  console.log('- 設定')
  await setDoc(doc(db, 'settings', 'tax'), { rate: 0.1, mode: 'exclusive' })
  await setDoc(doc(db, 'settings', 'fees'), { card: 0.1, qr: 0.03 })
  await setDoc(doc(db, 'settings', 'back'), { rate: 0.1, drinkRate: 200 })

  console.log('- メニュー')
  for (const m of MENUS) await setDoc(doc(collection(db, 'menus')), m)

  console.log('- キャスト')
  for (const c of CASTS) await setDoc(doc(collection(db, 'casts')), c)

  console.log('完了。owner/password または staff/000000 でログインできます。')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
