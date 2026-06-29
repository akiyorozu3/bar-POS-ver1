import type { Transaction, SalesSummary } from '@/types'

const PAY_LABEL: Record<string, string> = {
  cash: '現金',
  card: 'カード',
  qr: 'QR払い',
}

/** 取引一覧をCSV文字列に変換（BOM付きUTF-8、Excelで開ける） */
export function buildTransactionCSV(transactions: Transaction[]): string {
  const headers = [
    '日時',
    '席名',
    '一人客',
    '支払い方法',
    '税抜売上',
    '消費税',
    '税込売上',
    '手数料率(%)',
    '手数料額',
    '実入金額',
    '主担当キャスト',
  ]

  const rows = transactions.map((t) => [
    new Date(t.completedAt).toLocaleString('ja-JP'),
    t.seatName,
    t.solo ? '○' : '',
    PAY_LABEL[t.payMethod] ?? t.payMethod,
    t.subtotal,
    t.tax,
    t.total,
    t.feeRate,
    t.feeAmount,
    t.netAmount,
    t.primaryCast,
  ])

  return buildCSV([headers, ...rows])
}

/** キャストバック集計CSVを生成 */
export function buildCastCSV(summary: SalesSummary): string {
  const headers = ['キャスト', '担当件数', '売上合計', 'バック額']
  const rows = summary.castSummaries.map((c) => [
    c.name,
    c.txCount,
    c.salesAmount,
    c.backAmount,
  ])
  return buildCSV([headers, ...rows])
}

function buildCSV(data: (string | number)[][]): string {
  const BOM = '\uFEFF'
  const csv = data
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n')
  return BOM + csv
}

/** CSVをファイルダウンロードとして発火 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
