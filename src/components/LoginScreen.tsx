import { useState } from 'react'
import { usePosStore } from '@/store/posStore'

export default function LoginScreen() {
  const { signIn, signingIn, authError } = usePosStore()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = id.trim().length > 0 && password.length > 0 && !signingIn

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    signIn(id, password)
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-title">バーPOS</div>
        <div className="login-sub">ユーザーIDとパスワードを入力してください</div>

        <label className="login-lbl">ユーザーID</label>
        <input
          className="login-input"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="例：staff"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />

        <label className="login-lbl">パスワード</label>
        <input
          className="login-input"
          type="password"
          autoComplete="current-password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {authError && <div className="login-error">{authError}</div>}

        <button className="login-btn" type="submit" disabled={!canSubmit}>
          {signingIn ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}
