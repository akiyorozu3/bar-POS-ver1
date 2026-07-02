// エミュレータにサンプルデータを投入する開発用スクリプト。
// 前提: 別ターミナルで `npm run emu` を起動しておくこと。
// 実行:  npm run seed:emu
//
// 本番には一切接続しない（demo-bar-pos + ローカルエミュレータのみ）。

import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, doc, setDoc, collection } from 'firebase/firestore'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth'

const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-bar-pos', authDomain: 'demo-bar-pos.firebaseapp.com' })
const db = getFirestore(app)
const auth = getAuth(app)
connectFirestoreEmulator(db, '127.0.0.1', 8080)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })

const DOMAIN = process.env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'

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
  console.log('サンプルデータ投入中（エミュレータ demo-bar-pos）...')

  console.log('- アカウント')
  await ensureUser('owner', 'password')
  await ensureUser('staff', '000000')

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
