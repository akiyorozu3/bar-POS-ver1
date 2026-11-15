// 大入（おおいり）の設定を、指定した「適用日(from)」で書き込む。
// アプリの「保存」は from=今日 固定なので、制度開始日にさかのぼって設定したいとき用。
//   適用日(from)以降の営業日は、売上が閾値(15万/25万)を超えれば原資が按分される。
// 使い方（パスワードは OWNER_PW 経由で渡す＝履歴に残さない）:
//   OWNER_PW='実パスワード' node scripts/set-oiri-from.mjs .env 2026-11-01 20000 30000
import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const envPath = process.argv[2] || '.env'
const FROM = process.argv[3] || '2026-11-01'
const T1 = Math.max(0, Math.round(Number(process.argv[4] ?? 20000)))
const T2 = Math.max(0, Math.round(Number(process.argv[5] ?? 30000)))
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM)) { console.error('適用日は YYYY-MM-DD で指定してください'); process.exit(1) }

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
const OWNER_PW = process.env.OWNER_PW
if (!OWNER_PW) { console.error('OWNER_PW 環境変数に owner のパスワードを入れて実行してください'); process.exit(1) }

async function main() {
  console.log(`対象プロジェクト: ${env.VITE_FIREBASE_PROJECT_ID}`)
  await signInWithEmailAndPassword(auth, `owner@${DOMAIN}`, OWNER_PW)

  const ref = doc(db, 'settings', 'oiri')
  const snap = await getDoc(ref)
  const prev = snap.exists() && Array.isArray(snap.data().tiers) ? snap.data().tiers : []
  console.log('\n── 変更前 ──')
  if (prev.length === 0) console.log('  （設定なし＝空）')
  else for (const t of [...prev].sort((a,b)=>a.from.localeCompare(b.from))) console.log(`  ${t.from}〜  ${t.tier1Threshold?.toLocaleString?.()||t.tier1Threshold}超→¥${t.tier1Amount?.toLocaleString?.()||t.tier1Amount} / ${t.tier2Threshold?.toLocaleString?.()||t.tier2Threshold}超→¥${t.tier2Amount?.toLocaleString?.()||t.tier2Amount}`)

  const entry = { from: FROM, tier1Threshold: 150000, tier1Amount: T1, tier2Threshold: 250000, tier2Amount: T2 }
  // 同じ from の既存エントリは置き換え。他の適用日はそのまま残す。
  const tiers = [...prev.filter((t) => t.from !== FROM), entry].sort((a, b) => a.from.localeCompare(b.from))
  await setDoc(ref, { tiers })

  console.log('\n── 変更後 ──')
  for (const t of tiers) console.log(`  ${t.from}〜  ${t.tier1Threshold.toLocaleString()}超→¥${t.tier1Amount.toLocaleString()} / ${t.tier2Threshold.toLocaleString()}超→¥${t.tier2Amount.toLocaleString()}`)
  console.log(`\n✔ 書き込み完了。${FROM} 以降の営業日で閾値を超えた日に大入が付きます。`)
  console.log('  検算: OWNER_PW=... node scripts/diag-oiri.mjs ' + envPath + ' 21')
  process.exit(0)
}
main().catch((e) => { console.error('ERROR:', e.code || e.message); process.exit(1) })
