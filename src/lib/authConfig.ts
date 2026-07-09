/**
 * authConfig.ts
 * ログインID ↔ Firebase Auth のメールアドレス変換と、ロール判定。
 *
 * Firebase Auth はメール/パスワード認証を使うため、現場で打ちやすいよう
 * 「ユーザーID」を内部で `<id>@<ドメイン>` のメールアドレスに変換して扱う。
 * スタッフ・オーナーにはこの変換は見えない（ログイン画面ではIDだけ入力）。
 */

import type { Role } from '@/types'

/** ID → メールに付与する固定ドメイン（実在しなくてよい） */
export const AUTH_ID_DOMAIN = import.meta.env.VITE_AUTH_ID_DOMAIN ?? 'bar-pos.local'

/** オーナー扱いにするログインID */
export const OWNER_ID = (import.meta.env.VITE_OWNER_ID ?? 'owner').trim().toLowerCase()

/** マネージャー扱いにするログインID（オーナーより弱く、スタッフより強い） */
export const MANAGER_ID = (import.meta.env.VITE_MANAGER_ID ?? 'manager').trim().toLowerCase()

/** ログインID → Firebase Auth 用メールアドレス */
export const idToEmail = (id: string): string =>
  `${id.trim().toLowerCase()}@${AUTH_ID_DOMAIN}`

/** オーナー／マネージャーのメールアドレス（Firestoreルールの判定と一致させること） */
export const OWNER_EMAIL = idToEmail(OWNER_ID)
export const MANAGER_EMAIL = idToEmail(MANAGER_ID)

/** ログイン中メールアドレスからロールを判定（一致しなければスタッフ） */
export const emailToRole = (email: string | null | undefined): Role => {
  const e = email?.toLowerCase()
  if (e === OWNER_EMAIL) return 'owner'
  if (e === MANAGER_EMAIL) return 'manager'
  return 'staff'
}
