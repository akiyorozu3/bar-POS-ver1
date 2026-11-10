// 新店の初期ログインアカウント（owner/manager/staff/zeimu）をまとめて作成する。
// フルseed（メニュー/キャスト等）は入れず、アカウントだけ作る（店が自分で初期設定する）。
//
// 使い方:
//   node scripts/ensure-store-accounts.mjs .env.concafe
//
// 前提: 対象プロジェクトの Auth メール/パスワードが有効化済みであること。
// パスワードは「仮」。開店前に各店で必ず変更してもらう。

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env.concafe'
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

// ログインID → ロール判定は src/lib/authConfig.ts（owner/manager/zeimu は固定ID、他は staff）。
// ここで作る初期アカウントと「仮」パスワード。開店前に必ず変更すること。
const ACCOUNTS = [
  { id: env.VITE_OWNER_ID || 'owner', password: 'concafe-owner-2026' },
  { id: env.VITE_MANAGER_ID || 'manager', password: 'concafe-mgr-2026' },
  { id: 'staff', password: 'concafe-staff-2026' },
  { id: env.VITE_ZEIMU_ID || 'zeimu', password: 'concafe-zeimu-2026' },
]

async function main() {
  console.log(`対象プロジェクト: ${env.VITE_FIREBASE_PROJECT_ID}`)
  for (const a of ACCOUNTS) {
    const email = `${a.id}@${DOMAIN}`
    try {
      await createUserWithEmailAndPassword(auth, email, a.password)
      console.log(`✔ 作成: ${email} / ${a.password}`)
    } catch (e) {
      if (String(e.code).includes('email-already-in-use')) console.log(`ℹ 既に存在: ${email}`)
      else throw e
    }
  }
  console.log('\n※ パスワードはすべて「仮」です。開店前に必ず変更してください。')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
