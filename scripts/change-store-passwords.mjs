// 店アカウントのパスワードを変更する（現在のPWでサインイン→新PWに更新）。
// Admin SDK不要・クライアントSDKのみ。新PWはリポジトリに残さないよう外部JSONで渡す。
//
// 使い方:
//   node scripts/change-store-passwords.mjs .env.concafe /path/to/new-passwords.json
//
// new-passwords.json の形式（old省略時は仮PW concafe-<id>-2026 を使う。idはログインID）:
//   [
//     { "id": "owner",   "new": "新しいPW" },
//     { "id": "manager", "new": "新しいPW", "old": "現在のPW（任意）" },
//     { "id": "staff",   "new": "新しいPW" },
//     { "id": "zeimu",   "new": "新しいPW" }
//   ]
// 前提: Firebase Auth のパスワードは6文字以上。

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth'

const envPath = process.argv[2]
const jsonPath = process.argv[3]
if (!envPath || !jsonPath) {
  console.error('使い方: node scripts/change-store-passwords.mjs <envファイル> <new-passwords.json>')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const list = JSON.parse(readFileSync(jsonPath, 'utf8'))

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

async function main() {
  console.log(`対象プロジェクト: ${env.VITE_FIREBASE_PROJECT_ID}`)
  for (const a of list) {
    const email = `${a.id}@${DOMAIN}`
    const oldPw = a.old || `concafe-${a.id}-2026`
    if (!a.new || String(a.new).length < 6) { console.log(`✗ ${email}: new が未指定か6文字未満のためスキップ`); continue }
    try {
      const cred = await signInWithEmailAndPassword(auth, email, oldPw)
      await updatePassword(cred.user, a.new)
      await signOut(auth)
      console.log(`✔ 変更: ${email}`)
    } catch (e) {
      console.log(`✗ ${email}: ${e.code || e.message}`)
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
