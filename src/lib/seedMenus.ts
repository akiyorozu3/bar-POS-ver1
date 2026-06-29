import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc } from 'firebase/firestore'
import { DEFAULT_MENUS } from './defaultMenus'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function seed() {
  console.log('メニューを投入中...')
  for (const menu of DEFAULT_MENUS) {
    await addDoc(collection(db, 'menus'), menu)
    console.log(`追加: ${menu.name}`)
  }
  console.log('完了！')
}

seed().catch(console.error)