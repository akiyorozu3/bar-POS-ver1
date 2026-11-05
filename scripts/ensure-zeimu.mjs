// 税務アカウント（zeimu）を作成する単体スクリプト（閲覧のみの権限）。
// フルseedではなくアカウントだけ追加する。
//
// 使い方:
//   node scripts/ensure-zeimu.mjs .env.staging [パスワード]   # テスト環境
//   node scripts/ensure-zeimu.mjs .env [パスワード]           # 本番（bar-pos-b1993）
//   パスワード省略時は 'zeimu0000'
//
// 前提: 対象プロジェクトの Auth メール/パスワードが有効化済みであること。

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env.staging'
const password = process.argv[3] || 'zeimu0000'
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const DOMAIN = env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'
const ZEIMU_ID = env.VITE_ZEIMU_ID || 'zeimu'
const email = `${ZEIMU_ID}@${DOMAIN}`

async function main() {
  console.log(`対象プロジェクト: ${env.VITE_FIREBASE_PROJECT_ID}`)
  try {
    await createUserWithEmailAndPassword(auth, email, password)
    console.log(`✔ 作成しました: ${email} / ${password}`)
  } catch (e) {
    if (String(e.code).includes('email-already-in-use')) console.log(`ℹ 既に存在します: ${email}`)
    else throw e
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
