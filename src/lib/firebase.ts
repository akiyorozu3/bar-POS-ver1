import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// 開発用: VITE_USE_EMULATOR=true のときだけローカルのエミュレータに接続する。
// これにより本番Firestore/Authに一切触れずに開発・検証できる。
// 本番ビルド（.env.production 等）ではこのフラグは無いので接続されない。
export const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true'
if (USE_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8085)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  // eslint-disable-next-line no-console
  console.info('[bar-pos] Firebase エミュレータに接続中（本番には接続していません）')
}

// Firestore コレクション名の定数
export const COLLECTIONS = {
  TRANSACTIONS: 'transactions',
  MENUS: 'menus',
  CASTS: 'casts',
  SETTINGS: 'settings',
  TABLES: 'tables',
  CLOSURES: 'closures',
  PUNCHES: 'punches',
  PAYOUTS: 'payouts',
} as const
