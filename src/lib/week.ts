// シフト管理の「週」ヘルパー。月曜始まり・ISO週番号（例 2026-W30）。
// シフトは暦日で扱う（営業日境界 17:00 は使わない。計画は出勤する暦日で考えるため）。

const DOW = ['日', '月', '火', '水', '木', '金', '土']

// ローカル暦日の YYYY-MM-DD
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 今日（暦日）
export const todayYmd = (): string => ymd(new Date())

// その日を含む週の月曜 0:00
export const weekMonday = (d: Date): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 月=0 … 日=6
  x.setDate(x.getDate() - dow)
  return x
}

// 月曜から delta 週ずらした月曜
export const addWeeks = (monday: Date, delta: number): Date => {
  const x = new Date(monday)
  x.setDate(x.getDate() + delta * 7)
  return x
}

// 週の7日ぶんの Date（月〜日）
export const weekDates = (monday: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday)
    x.setDate(x.getDate() + i)
    return x
  })

// 曜日ラベル（月/火/…）
export const dowLabel = (d: Date): string => DOW[d.getDay()]

// セル用の短い日付ラベル（例 "月 7/21"）
export const dayLabel = (d: Date): string => `${dowLabel(d)} ${d.getMonth() + 1}/${d.getDate()}`

// 週レンジのラベル（例 "7/21(月) 〜 7/27(日)"）
export const weekRangeLabel = (monday: Date): string => {
  const sun = new Date(monday)
  sun.setDate(sun.getDate() + 6)
  return `${monday.getMonth() + 1}/${monday.getDate()}(${dowLabel(monday)}) 〜 ${sun.getMonth() + 1}/${sun.getDate()}(${dowLabel(sun)})`
}

// ISO 8601 週番号（木曜基準）。返す year は ISO週年（年跨ぎで暦年と異なる場合あり）。
export const isoWeek = (d: Date): { year: number; week: number } => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7 // 月=0 … 日=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // その週の木曜へ
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThu.getUTCDay() + 6) % 7
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((date.getTime() - firstThu.getTime()) / (7 * 24 * 3600 * 1000))
  return { year: date.getUTCFullYear(), week }
}

// weekId "YYYY-Www"（月曜を渡す想定だが週内どの日でも同じ結果）
export const weekIdOf = (d: Date): string => {
  const { year, week } = isoWeek(d)
  return `${year}-W${String(week).padStart(2, '0')}`
}
