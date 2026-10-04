export function formatBRL(cents: number | string | null | undefined) {
  const value = Number(cents ?? 0)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatMonth(value: Date) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(value)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function productLabel(product: {
  name: string
  brand?: string | null
  presentation?: string | null
  base_quantity?: number | string | null
  unit?: string | null
}) {
  const brand = product.brand ? `${product.brand} · ` : ''
  if (product.presentation) return `${brand}${product.name} · ${product.presentation}`

  // Mantém compatibilidade com cadastros antigos que já usavam peso/volume,
  // mas não exibe "1 unit" ou "2 unit", que pode ser confundido com a quantidade comprada.
  const legacyMeasure = product.unit && product.unit !== 'unit' && product.base_quantity
    ? ` · ${Number(product.base_quantity).toLocaleString('pt-BR')} ${unitLabel(product.unit)}`
    : ''
  return `${brand}${product.name}${legacyMeasure}`
}

export function unitLabel(unit?: string | null) {
  const labels: Record<string, string> = {
    unit: 'un.', g: 'g', kg: 'kg', ml: 'ml', l: 'L', pack: 'pacote', portion: 'porção', service: 'serviço', other: 'outro',
  }
  return labels[unit ?? ''] ?? unit ?? ''
}
