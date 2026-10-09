import { normalizeForMatch, normalizeReceiptText, parseReceiptText } from '@/lib/receipt-parser'

type Unit = 'unit' | 'kg' | 'g' | 'l' | 'ml'
type Confidence = 'high' | 'medium' | 'low'

function moneyToCents(raw: string | undefined | null) {
  if (!raw) return 0
  const clean = raw.replace(/[^0-9,.-]/g, '')
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0
}

function titleCase(value: string) {
  return value.toLowerCase().split(/\s+/).filter(Boolean).map((word) => word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ')
}

function inferPresentation(rawName: string) {
  const size = rawName.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(ML|LT|L|KG|G)\b/i)
  if (!size) return null
  const unit = size[2].toLowerCase() === 'lt' ? 'l' : size[2].toLowerCase()
  return `${size[1].replace('.', ',')} ${unit}`
}

function stripSplitBarcodePrefix(value: string) {
  const match = value.match(/^((?:\d{2,14}\s+){1,3})(?=[A-Za-zÀ-ÿ])/)
  if (!match) return value
  const digits = match[1].replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 14 ? value.slice(match[0].length) : value
}

function normalizeCommonProductText(value: string) {
  let result = value
    .replace(/[_|]+/g, ' ')
    .replace(/\bCOCA\s+COLA\b/gi, 'Coca-Cola')
    .replace(/\bLEITE\s+INT\b/gi, 'Leite Integral')
    .replace(/\bAGUA\b/gi, 'Água')
    .replace(/\bS\s*[/\\]\s*(?:GAS|BAS)\b/gi, 'Sem Gás')
    .replace(/\bRETOMAVEL\b/gi, 'Retornável')
    .replace(/\bRETORNAVEL\b/gi, 'Retornável')
    .replace(/\s+-\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (/retornável/i.test(result) && !/(sacola|garrafa|vasilhame)/i.test(result)) {
    const firstWord = result.split(' ')[0] ?? ''
    if (firstWord.length <= 6 || /\d/.test(firstWord)) result = 'Sacola Retornável'
  }
  return result
}

function cleanItemName(rawName: string, presentation: string | null) {
  let name = stripSplitBarcodePrefix(rawName)
    .replace(/^\d{6,14}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (presentation) {
    const [amount, unit] = presentation.split(' ')
    const units = unit === 'l' ? '(?:L|LT)' : unit.toUpperCase()
    name = name.replace(new RegExp(`\\s${amount.replace(',', '[,.]')}\\s*${units}\\b`, 'i'), '').trim()
  }

  name = name
    .replace(/\s+(?:T\d{1,3}|F)\s*$/i, '')
    .replace(/^[^A-Za-zÀ-ÿ]+/, '')
    .trim()

  name = normalizeCommonProductText(name || rawName)
  return titleCase(name)
    .replace(/Coca-Cola/gi, 'Coca-Cola')
    .replace(/Água/gi, 'Água')
    .replace(/Sem Gás/gi, 'Sem Gás')
    .replace(/Retornável/gi, 'Retornável')
}

function unitFromToken(token?: string): Unit {
  const value = (token ?? '').toLowerCase()
  if (value === 'kg') return 'kg'
  if (value === 'g') return 'g'
  if (value === 'l' || value === 'lt') return 'l'
  if (value === 'ml') return 'ml'
  return 'unit'
}

function createItem(args: { rawName: string; barcode: string | null; quantity: number; unit: Unit; unitPriceCents: number; totalCents: number; sourceLine: string; confidence: Confidence }) {
  const presentation = inferPresentation(args.rawName)
  const name = cleanItemName(args.rawName, presentation)
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rawName: args.rawName,
    name,
    barcode: args.barcode,
    presentation,
    quantity: args.quantity > 0 ? args.quantity : 1,
    unit: args.unit,
    unitPriceCents: args.unitPriceCents,
    totalCents: args.totalCents,
    discountCents: 0,
    notes: '',
    confidence: args.confidence,
    sourceLine: args.sourceLine,
  }
}

function joinLikelySplitLines(lines: string[]) {
  const result: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const current = lines[index].replace(/\s+/g, ' ').trim()
    const next = (lines[index + 1] ?? '').replace(/\s+/g, ' ').trim()
    const beginsItem = /^\d{1,3}\s+(?:\d{6,14}\s+)?[A-Za-zÀ-ÿ]/.test(current)
    const alreadyHasQuantity = /\d+(?:[.,]\d{1,3})?\s*(?:UN|KG|G|L|LT|ML)\b/i.test(current)
    const nextLooksLikeValues = /^\d+(?:[.,]\d{1,3})?\s*(?:UN|KG|G|L|LT|ML)\b/i.test(next)
    if (beginsItem && !alreadyHasQuantity && nextLooksLikeValues) { result.push(`${current} ${next}`); index++ }
    else if (current) result.push(current)
  }
  return result
}

function tolerantItems(rawText: string) {
  const lines = joinLikelySplitLines(normalizeReceiptText(rawText).split('\n').map((line) => line.trim()).filter(Boolean))
  const items: any[] = []

  for (const original of lines) {
    const line = original.replace(/[×]/g, 'X').replace(/\s+/g, ' ').trim()
    const start = line.match(/^\s*(\d{1,3})\s+(.+)$/)
    if (!start) continue

    let body = start[2].trim()
    const barcodeMatch = body.match(/^(\d{6,14})\s+(.*)$/)
    const barcode = barcodeMatch?.[1] ?? null
    if (barcodeMatch) body = barcodeMatch[2].trim()

    const quantityMatch = body.match(/(\d+(?:[.,]\d{1,3})?)\s*(UN|KG|G|L|LT|ML)\s*(?:[Xx*]\s*)?(\d+(?:[.,]\d{2}))/i)
    if (quantityMatch && quantityMatch.index !== undefined) {
      const rawName = body.slice(0, quantityMatch.index).trim()
      if (!/[A-Za-zÀ-ÿ]{2}/.test(rawName)) continue
      const quantity = Number(quantityMatch[1].replace(',', '.'))
      const unitPrice = moneyToCents(quantityMatch[3])
      const after = body.slice(quantityMatch.index + quantityMatch[0].length)
      const trailingMoney = [...after.matchAll(/(\d{1,6}[.,]\d{2})/g)]
      const total = trailingMoney.length ? moneyToCents(trailingMoney[trailingMoney.length - 1][1]) : Math.round(quantity * unitPrice)
      if (!unitPrice || !total) continue
      items.push(createItem({ rawName, barcode, quantity, unit: unitFromToken(quantityMatch[2]), unitPriceCents: unitPrice, totalCents: total, sourceLine: original, confidence: 'medium' }))
      continue
    }

    const moneyMatches = [...body.matchAll(/(\d{1,6}[.,]\d{2})/g)]
    if (moneyMatches.length >= 2) {
      const firstMoneyIndex = moneyMatches[moneyMatches.length - 2].index ?? -1
      if (firstMoneyIndex <= 0) continue
      const rawName = body.slice(0, firstMoneyIndex).replace(/\s+\d+(?:[.,]\d{1,3})?\s*$/, '').trim()
      if (!/[A-Za-zÀ-ÿ]{3}/.test(rawName) || /(total|subtotal|taxa|desconto|valor)/i.test(rawName)) continue
      const unitPrice = moneyToCents(moneyMatches[moneyMatches.length - 2][1])
      const total = moneyToCents(moneyMatches[moneyMatches.length - 1][1])
      if (!unitPrice || !total) continue
      const ratio = total / unitPrice
      const quantity = Number.isFinite(ratio) && ratio >= 1 && Math.abs(ratio - Math.round(ratio)) < .05 ? Math.round(ratio) : 1
      items.push(createItem({ rawName, barcode, quantity, unit: 'unit', unitPriceCents: unitPrice, totalCents: total, sourceLine: original, confidence: 'low' }))
    }
  }

  const seen = new Set<string>()
  return items.filter((item) => {
    const signature = `${item.barcode || normalizeForMatch(item.name)}|${item.quantity.toFixed(3)}|${item.unitPriceCents}|${item.totalCents}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

export function parseReceiptTextSmart(rawText: string) {
  const base = parseReceiptText(rawText)
  const fallback = tolerantItems(rawText)
  if (!fallback.length) return base

  const existing = new Set((base.items as any[]).map((item) => `${item.barcode || normalizeForMatch(item.name)}|${item.quantity.toFixed(3)}|${item.unitPriceCents}|${item.totalCents}`))
  const recovered = fallback.filter((item) => !existing.has(`${item.barcode || normalizeForMatch(item.name)}|${item.quantity.toFixed(3)}|${item.unitPriceCents}|${item.totalCents}`))
  const items = [...(base.items as any[]), ...recovered]
  const warnings = base.warnings.filter((warning) => !warning.startsWith('Não conseguimos separar os itens automaticamente'))

  if (recovered.length && base.items.length === 0) warnings.unshift(`${recovered.length} item(ns) foram recuperados por uma leitura tolerante. Revise os campos destacados antes de registrar.`)
  else if (recovered.length) warnings.unshift(`${recovered.length} item(ns) adicionais foram recuperados automaticamente e precisam de revisão.`)

  return { ...base, items, warnings } as typeof base
}
