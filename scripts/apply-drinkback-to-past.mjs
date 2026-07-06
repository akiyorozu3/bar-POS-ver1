// 過去の取引のキャストドリンクに、現在のメニューの円バック(drinkBack)を反映する。
// 商品名でメニューを引き当て、item.drinkBack を後付けする（→ 集計が円バックになる）。
//
// 使い方（プロジェクト直下で）:
//   node scripts/apply-drinkback-to-past.mjs            # ドライラン（変更内容の表示のみ）
//   node scripts/apply-drinkback-to-past.mjs --apply    # 実際に書き込む
//
// 接続先は .env（本番）。実行前にメニュー側の円バックを設定しておくこと。

import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const APPLY = process.argv.includes('--apply')
const DRINK = 'キャストドリンク'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)
await signInWithEmailAndPassword(getAuth(app), `owner@${env.VITE_AUTH_ID_DOMAIN || 'bar-pos.local'}`, 'password')

console.log(`接続先: ${env.VITE_FIREBASE_PROJECT_ID}  モード: ${APPLY ? '★書き込み(--apply)' : 'ドライラン'}`)

// メニュー名 → 円バック（キャストドリンクで drinkBack が設定されているもの）
const menus = await getDocs(collection(db, 'menus'))
const backByName = new Map()
menus.docs.forEach((d) => { const m = d.data(); if (m.category === DRINK && m.drinkBack != null) backByName.set(m.name, m.drinkBack) })
console.log('円バックが設定されたキャストドリンク:', [...backByName.entries()].map(([n, v]) => `${n}=¥${v}`).join(' / ') || '(なし)')
if (backByName.size === 0) { console.log('※ メニューに円バックが未設定です。先にメニュー管理で設定してください。'); process.exit(0) }

const txs = await getDocs(collection(db, 'transactions'))
let changedTx = 0, changedItems = 0
for (const dref of txs.docs) {
  const t = dref.data()
  let touched = false
  const items = (t.items || []).map((it) => {
    if (it.category === DRINK && it.drinkBack == null && backByName.has(it.name)) {
      touched = true; changedItems++
      console.log(`  [${t.seatName}] ${it.name} ×${it.qty} → drinkBack ¥${backByName.get(it.name)}`)
      return { ...it, drinkBack: backByName.get(it.name) }
    }
    return it
  })
  if (touched) {
    changedTx++
    if (APPLY) await updateDoc(doc(db, 'transactions', dref.id), { items })
  }
}
console.log(`\n対象: ${changedTx}件の取引 / ${changedItems}個の明細`)
console.log(APPLY ? '→ 書き込み完了' : '→ ドライラン（--apply で実際に反映）')
process.exit(0)
