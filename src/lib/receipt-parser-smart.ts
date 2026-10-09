import { normalizeForMatch, normalizeReceiptText, parseReceiptText } from '@/lib/receipt-parser'

type Unit = 'unit' | 'kg' | 'g' | 'l' | 'ml'
type Confidence = 'high' | 'medium' | 'low'
type SmartItem = ReturnType<typeof createItem>
type IndexedBlock = { index: number; lines: string[]; sourceLine: string }

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
  const compact = value.replace(/\s+/g, ' ').trim()
  const contiguous = compact.match(/^\d{6,14}\s+/)
  if (contiguous) return compact.slice(contiguous[0].length)
  const split = compact.match(/^((?:\d{2,14}\s+){1,3})(?=[A-Za-zÀ-ÿ])/)
  if (!split) return compact
  const digits = split[1].replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 14 ? compact.slice(split[0].length) : compact
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
    .replace(/\bPAP\s+HIG\b/gi, 'Papel Higiênico')
    .replace(/\bPAPEL\s+HIG\b/gi, 'Papel Higiênico')
    .replace(/\bPAPEL\s+TOALHA\b/gi, 'Papel Toalha')
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
    .replace(/Higiênico/gi, 'Higiênico')
}

function unitFromToken(token?: string): Unit {
  const value = (token ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (value === 'kg' || value === 'k6') return 'kg'
  if (value === 'g') return 'g'
  if (value === 'l' || value === 'lt') return 'l'
  if (value === 'ml') return 'ml'
  return 'unit'
}

function createItem(args: { rawName: string; barcode: string | null; quantity: number; unit: Unit; unitPriceCents: number; totalCents: number; sourceLine: string; confidence: Confidence; notes?: string }) {
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
    notes: args.notes ?? '',
    confidence: args.confidence,
    sourceLine: args.sourceLine,
  }
}

function itemIndexFromSourceLine(value: string) {
  const match = value.trim().match(/^0?(\d{1,2})\b/)
  const index = match ? Number(match[1]) : 0
  return index >= 1 && index <= 99 ? index : 0
}

function extractIndexedBlocks(rawText: string) {
  const lines = normalizeReceiptText(rawText).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const blocks: IndexedBlock[] = []
  let current: IndexedBlock | null = null
  let insideItems = false

  const flush = () => {
    if (!current) return
    current.sourceLine = current.lines.join(' ')
    blocks.push(current)
    current = null
  }

  for (const line of lines) {
    const normalized = normalizeForMatch(line)
    if (/\b(descricao|descric[aã]o)\b/.test(normalized) && /(qtd|vl|total|codigo)/.test(normalized)) {
      insideItems = true
      continue
    }
    if (insideItems && /(qtd\s*total.*itens|total\s*de\s*itens|valor\s*total)/.test(normalized)) {
      flush()
      break
    }

    const start = line.match(/^\s*0?(\d{1,2})\s+(.+)$/)
    if (start) {
      const index = Number(start[1])
      const looksLikeItem = index >= 1 && index <= 99 && /(?:\d{6,14}|[A-Za-zÀ-ÿ]{3})/.test(start[2])
      if (looksLikeItem && (insideItems || index === 1 || (current && index === current.index + 1))) {
        flush()
        insideItems = true
        current = { index, lines: [line], sourceLine: line }
        continue
      }
    }

    if (current) current.lines.push(line)
  }
  flush()

  const unique = new Map<number, IndexedBlock>()
  for (const block of blocks) if (!unique.has(block.index)) unique.set(block.index, block)
  return [...unique.values()].sort((a, b) => a.index - b.index)
}

function parseIndexedBlock(block: IndexedBlock): SmartItem {
  const combined = block.lines.join(' ').replace(/[×]/g, 'X').replace(/\s+/g, ' ').trim()
  let body = combined.replace(/^\s*0?\d{1,2}\s+/, '').trim()
  const barcodeMatch = body.match(/^(\d{6,14})\s+(.*)$/)
  const barcode = barcodeMatch?.[1] ?? null
  if (barcodeMatch) body = barcodeMatch[2].trim()

  body = body
    .replace(/\bU[MNH]\b/gi, 'UN')
    .replace(/\bK[6G]\b/gi, 'KG')
    .replace(/\s+/g, ' ')

  const quantityMatch = body.match(/(\d+(?:[.,]\d{1,3})?)\s*(UN|KG|G|L|LT|ML)\s*(?:[Xx*]\s*)?(\d{1,6}[.,]\d{2})/i)
  const moneyMatches = [...body.matchAll(/(\d{1,6}[.,]\d{2})/g)]

  let quantity = quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : 0
  let unit = quantityMatch ? unitFromToken(quantityMatch[2]) : 'unit' as Unit
  let unitPrice = quantityMatch ? moneyToCents(quantityMatch[3]) : 0
  let total = moneyMatches.length ? moneyToCents(moneyMatches[moneyMatches.length - 1][1]) : 0

  if (!unitPrice && moneyMatches.length >= 2) unitPrice = moneyToCents(moneyMatches[moneyMatches.length - 2][1])
  if (!quantity && unitPrice && total) {
    const ratio = total / unitPrice
    if (ratio >= .001 && ratio <= 999 && Math.abs(ratio - Math.round(ratio)) < .03) quantity = Math.round(ratio)
  }
  if (!quantity) {
    const looseQuantity = body.match(/(\d+(?:[.,]\d{1,3})?)\s*(KG|UN|G|L|LT|ML)\b/i)
    if (looseQuantity) {
      quantity = Number(looseQuantity[1].replace(',', '.'))
      unit = unitFromToken(looseQuantity[2])
    }
  }

  const firstValueIndex = quantityMatch?.index ?? (moneyMatches.length >= 2 ? moneyMatches[moneyMatches.length - 2].index ?? body.length : body.length)
  let rawName = body.slice(0, firstValueIndex).trim()
  rawName = rawName.replace(/\s+(?:T\d{1,3}|F)\s*$/i, '').trim()
  if (!/[A-Za-zÀ-ÿ]{2}/.test(rawName)) rawName = `Item ${String(block.index).padStart(2, '0')} da nota`

  const complete = Boolean(unitPrice > 0 && total > 0 && quantity > 0 && /[A-Za-zÀ-ÿ]{2}/.test(rawName))
  return createItem({
    rawName,
    barcode,
    quantity: quantity || 1,
    unit,
    unitPriceCents: unitPrice,
    totalCents: total || (quantity && unitPrice ? Math.round(quantity * unitPrice) : 0),
    sourceLine: `${String(block.index).padStart(2, '0')} ${combined.replace(/^\s*0?\d{1,2}\s+/, '')}`,
    confidence: complete ? 'medium' : 'low',
    notes: complete ? '' : `Item ${String(block.index).padStart(2, '0')} da nota não foi interpretado completamente. Revise nome, quantidade e preço.`,
  })
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
  const items: SmartItem[] = []

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

function scoreItem(item: any) {
  let score = item.confidence === 'high' ? 4 : item.confidence === 'medium' ? 3 : 1
  if (item.unitPriceCents > 0) score += 2
  if (item.totalCents > 0) score += 2
  if (item.name && !/^Item \d+ da nota$/i.test(item.name)) score += 1
  return score
}

export function parseReceiptTextSmart(rawText: string) {
  const base = parseReceiptText(rawText)
  const fallback = tolerantItems(rawText)
  const indexedBlocks = extractIndexedBlocks(rawText)
  const indexedItems = indexedBlocks.map(parseIndexedBlock)

  const candidates = [...(base.items as any[]), ...fallback, ...indexedItems]
  const byIndex = new Map<number, any>()
  const withoutIndex: any[] = []

  for (const item of candidates) {
    const index = itemIndexFromSourceLine(item.sourceLine ?? '')
    if (!index) { withoutIndex.push(item); continue }
    const current = byIndex.get(index)
    if (!current || scoreItem(item) > scoreItem(current)) byIndex.set(index, item)
  }

  const indexedResult = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item)
  const seen = new Set(indexedResult.map((item) => `${item.barcode || normalizeForMatch(item.name)}|${item.quantity.toFixed(3)}|${item.unitPriceCents}|${item.totalCents}`))
  const extras = withoutIndex.filter((item) => {
    const signature = `${item.barcode || normalizeForMatch(item.name)}|${item.quantity.toFixed(3)}|${item.unitPriceCents}|${item.totalCents}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
  const items = [...indexedResult, ...extras]

  const warnings = base.warnings.filter((warning) => !warning.startsWith('Não conseguimos separar os itens automaticamente'))
  const incomplete = indexedResult.filter((item) => item.unitPriceCents <= 0 || item.totalCents <= 0 || /^Item \d+ da nota$/i.test(item.name)).length
  const recovered = Math.max(0, items.length - base.items.length)

  if (indexedBlocks.length) warnings.unshift(`${indexedBlocks.length} linha(s) numerada(s) da nota foram preservadas para conferência.`)
  if (recovered) warnings.unshift(`${recovered} item(ns) adicionais foram recuperados automaticamente e precisam de revisão.`)
  if (incomplete) warnings.unshift(`${incomplete} item(ns) não foram interpretados por completo e foram mantidos para preenchimento manual.`)

  return { ...base, items, warnings } as typeof base
}
