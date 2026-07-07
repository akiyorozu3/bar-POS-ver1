// アプリの自動アップデート検知。
// いま動いている本体JS（/assets/index-XXXX.js）と、サーバー上の最新 index.html が
// 参照する本体JSを比べ、違えば「新しい版が出た」と判断してコールバックを呼ぶ。
// （index.html は no-cache 配信なので、fetch すれば常に最新が取れる）

// 起動時に読み込まれている本体JSのファイル名を取得
const currentSrc = (() => {
  const scripts = Array.from(document.querySelectorAll('script[src]'))
  const src = scripts.map((el) => el.getAttribute('src') || '').find((s) => /\/assets\/index-[\w-]+\.js/.test(s))
  const m = src?.match(/\/assets\/index-[\w-]+\.js/)
  return m ? m[0] : ''
})()

export function startVersionCheck(onNewVersion: () => void): () => void {
  let notified = false

  const check = async () => {
    if (notified || !currentSrc) return
    try {
      const res = await fetch('/index.html', { cache: 'no-store' })
      if (!res.ok) return
      const html = await res.text()
      const m = html.match(/\/assets\/index-[\w-]+\.js/)
      const latest = m ? m[0] : ''
      if (latest && latest !== currentSrc) {
        notified = true
        onNewVersion()
      }
    } catch {
      /* オフライン・通信失敗などは無視（次回チェックで再試行） */
    }
  }

  // 5分ごと＋タブが再表示された時＋起動30秒後に確認
  const interval = window.setInterval(check, 5 * 60 * 1000)
  const onVisible = () => { if (!document.hidden) check() }
  document.addEventListener('visibilitychange', onVisible)
  const first = window.setTimeout(check, 30 * 1000)

  return () => {
    window.clearInterval(interval)
    window.clearTimeout(first)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
