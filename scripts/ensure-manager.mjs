// マネージャーアカウント（manager / 1carat123）を作成する単体スクリプト。
// 既存環境（staging/prod）は menus/casts を再投入したくないので、フルseedではなく
// このスクリプトでアカウントだけ追加する。
//
// 使い方:
//   node scripts/ensure-manager.mjs .env.staging   # テスト環境
//   node scripts/ensure-manager.mjs .env           # 本番（bar-pos-b1993）
//
// 前提: 対象プロジェクトの Auth メール/パスワードが有効化済みであること。

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env.staging'
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
const MANAGER_ID = env.VITE_MANAGER_ID || 'manager'
const email = `${MANAGER_ID}@${DOMAIN}`
const password = '1carat123'

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
