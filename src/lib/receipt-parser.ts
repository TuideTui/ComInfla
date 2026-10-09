export type ReceiptConfidence = 'high' | 'medium' | 'low'

export type ParsedReceiptItem = {
  key: string
  rawName: string
  name: string
  barcode: string | null
  presentation: string | null
  quantity: number
  unit: 'unit' | 'kg' | 'g' | 'l' | 'ml'
  unitPriceCents: number
  totalCents: number
  discountCents: number
  notes: string
  confidence: ReceiptConfidence
  sourceLine: string
}

export type ParsedReceipt = {
  merchantName: string
  merchantCnpj: string
  purchasedAt: string
  paymentMethod: string
  sourceKind: 'nfce' | 'delivery' | 'receipt' | 'unknown'
  documentKey: string
  totalCents: number
  extraFeesCents: number
  orderDiscountCents: number
  items: ParsedReceiptItem[]
  warnings: string[]
}

const moneyPattern = /(?:R\$\s*)?(\d{1,6}(?:\.\d{3})*,\d{2}|\d{1,6}\.\d{2})/

export function normalizeReceiptText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[|¦]/g, 'I')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
}

export function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

function moneyToCents(raw: string | undefined | null) {
  if (!raw) return 0
  const clean = raw.replace(/[^0-9,.-]/g, '')
  if (!clean) return 0
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0
}

function inferPresentation(rawName: string) {
  const compact = rawName.replace(/\s+/g, ' ').trim()
  const size = compact.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(ML|L|KG|G)\b/i)
  if (size) {
    const amount = size[1].replace('.', ',')
    return `${amount} ${size[2].toLowerCase()}`
  }
  const pack = compact.match(/(?:C\/|C\s+)(\d{1,3})\b/i)
  if (pack) return `${pack[1]} unidades`
  return null
}

function cleanProductName(rawName: string, presentation: string | null) {
  let value = rawName
    .replace(/^\d{5,14}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (presentation) {
    const [amount, unit] = presentation.split(' ')
    if (unit && unit !== 'unidades') {
      const pattern = new RegExp(`\\s${amount.replace(',', '[,.]')}\\s*${unit}\\b`, 'i')
      value = value.replace(pattern, '')
    }
  }
  value = value.replace(/\s+(?:T\d{1,2}|F)$/i, '').trim()
  return titleCase(value || rawName)
}

function detectSourceKind(text: string): ParsedReceipt['sourceKind'] {
  const normalized = normalizeForMatch(text)
  if (normalized.includes('nota fiscal de consumidor eletronica') || normalized.includes('nfce') || normalized.includes('nfce consulta')) return 'nfce'
  if (normalized.includes('ifood') || normalized.includes('99food') || normalized.includes('entrega da plataforma') || normalized.includes('comprovante delivery')) return 'delivery'
  if (normalized.includes('cupom') || normalized.includes('valor total') || normalized.includes('subtotal')) return 'receipt'
  return 'unknown'
}

function detectCnpj(text: string) {
  const match = text.match(/CNPJ\s*[:.]?\s*([0-9.\/-]{14,20})/i)
  return match ? match[1].replace(/\D/g, '').slice(0, 14) : ''
}

function detectDocumentKey(text: string) {
  const candidates = text.match(/(?:\d[\s.]*){44}/g) ?? []
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '')
    if (digits.length === 44) return digits
  }
  return ''
}

function parseLocalDate(text: string) {
  const patterns = [
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
    /(?:Emiss[aã]o|Data)\s*[:.]?\s*(\d{2})\/(\d{2})\/(\d{4})[^0-9]+(\d{2}):(\d{2})(?::(\d{2}))?/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const [, day, month, year, hour, minute, second = '00'] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return ''
}

function detectPayment(text: string) {
  const normalized = normalizeForMatch(text)
  if (normalized.includes('cartao debito') || normalized.includes('cartão débito')) return 'debit_card'
  if (normalized.includes('cartao credito') || normalized.includes('cartão crédito')) return 'credit_card'
  if (/\bpix\b/.test(normalized)) return 'pix'
  if (normalized.includes('dinheiro')) return 'cash'
  if (normalized.includes('voucher') || normalized.includes('vale alimentacao') || normalized.includes('vale refeicao')) return 'benefit'
  return ''
}

function detectMerchant(lines: string[], sourceKind: ParsedReceipt['sourceKind']) {
  const stopWords = ['cnpj', 'documento auxiliar', 'nota fiscal', 'comprovante', 'entrega', 'pedido', 'cliente', 'codigo de verificacao', 'código de verificação']
  const platformWords = sourceKind === 'delivery' ? ['99food', 'ifood'] : []
  const candidates = lines.slice(0, 14).filter((line) => {
    const n = normalizeForMatch(line)
    if (line.length < 4 || /^[-_=.#\d\s]+$/.test(line)) return false
    if (stopWords.some((word) => n.includes(normalizeForMatch(word)))) return false
    if (platformWords.some((word) => n === word)) return false
    if (/^(avenida|av |rua |telefone|fone|cep|ie\b)/i.test(n)) return false
    return /[a-zA-ZÀ-ÿ]{3}/.test(line)
  })
  if (!candidates.length) return ''
  if (sourceKind === 'delivery') {
    const businessCandidate = candidates.find((line) => /(ltda|restaurante|espeteria|carnes|delivery|refei|pizz|burg|bar |grill|cozinha)/i.test(line))
    if (businessCandidate) return titleCase(businessCandidate.replace(/^[#\d\s]+/, '').trim())
  }
  return titleCase(candidates[0].replace(/^[#\d\s]+/, '').trim())
}

function detectSummaryAmount(lines: string[], labels: RegExp[]) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!labels.some((label) => label.test(line))) continue
    const matches = [...line.matchAll(new RegExp(moneyPattern.source, 'gi'))]
    if (matches.length) return moneyToCents(matches[matches.length - 1][1])
    if (i + 1 < lines.length) {
      const next = lines[i + 1].match(moneyPattern)
      if (next) return moneyToCents(next[1])
    }
  }
  return 0
}

function detectTotals(lines: string[]) {
  const total = detectSummaryAmount(lines, [
    /valor\s+total\s*\(?(?:r\$|rs)?\)?/i,
    /total\s+do\s+pedido/i,
    /\(=\)\s*total/i,
    /^total\s*(?:r\$|rs)?/i,
    /pagamento\s+via\s+99food/i,
    /valor\s+pago\s+online/i,
  ])
  let fees = 0
  let discount = 0
  const seenFees = new Set<string>()
  const seenDiscounts = new Set<string>()
  for (const line of lines) {
    const amountMatch = line.match(moneyPattern)
    if (!amountMatch) continue
    const amount = moneyToCents(amountMatch[1])
    const normalized = normalizeForMatch(line)
    if (/(taxa|entrega|servico|serviço|frete)/i.test(normalized) && amount > 0) {
      const key = normalized.replace(/[0-9 ]+/g, '').slice(0, 40)
      if (!seenFees.has(key)) { fees += amount; seenFees.add(key) }
    }
    if (/(desconto|cupom|voucher)/i.test(normalized) && amount > 0) {
      const key = normalized.replace(/[0-9 ]+/g, '').slice(0, 40)
      if (!seenDiscounts.has(key)) { discount += amount; seenDiscounts.add(key) }
    }
  }
  return { total, fees, discount }
}

function unitFromToken(token?: string): ParsedReceiptItem['unit'] {
  const value = (token ?? '').toLowerCase()
  if (value === 'kg') return 'kg'
  if (value === 'g') return 'g'
  if (value === 'l' || value === 'lt') return 'l'
  if (value === 'ml') return 'ml'
  return 'unit'
}

function makeItem(rawName: string, barcode: string | null, quantity: number, unit: ParsedReceiptItem['unit'], unitPriceCents: number, totalCents: number, sourceLine: string, confidence: ReceiptConfidence): ParsedReceiptItem {
  const presentation = inferPresentation(rawName)
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rawName,
    name: cleanProductName(rawName, presentation),
    barcode,
    presentation,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit,
    unitPriceCents: Math.max(0, unitPriceCents),
    totalCents: Math.max(0, totalCents),
    discountCents: 0,
    notes: '',
    confidence,
    sourceLine,
  }
}

function joinSplitItemLines(lines: string[]) {
  const joined: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]
    const next = lines[i + 1] ?? ''
    const startsItem = /^\s*\d{1,4}\s+(?:\d{5,14}\s+)?[A-Za-zÀ-ÿ]/.test(current)
    const hasPriceStructure = /\d+[.,]\d+\s*(?:UN|KG|G|L|LT|ML)?\s*[xX]\s*\d+[.,]\d{2}/i.test(current)
      || /\d+[.,]\d{3}\s*(?:UN|KG)\s+\d+[.,]\d{2}\s+\d+[.,]\d{2}/i.test(current)
    const nextIsContinuation = /^\s*\d+[.,]\d+\s*(?:UN|KG|G|L|LT|ML)?\s*(?:[xX]\s*)?\d+[.,]\d{2}/i.test(next)
    if (startsItem && !hasPriceStructure && nextIsContinuation) {
      joined.push(`${current} ${next}`)
      i++
    } else {
      joined.push(current)
    }
  }
  return joined
}

function parseItems(linesInput: string[]) {
  const lines = joinSplitItemLines(linesInput)
  const items: ParsedReceiptItem[] = []
  let lastPaidItem: ParsedReceiptItem | null = null

  for (const line of lines) {
    const compact = line.replace(/\s+/g, ' ').trim()
    if (!compact) continue

    const nfce = compact.match(/^\d{1,3}\s+(?:(\d{7,14})\s+)?(.+?)\s+(\d+(?:[.,]\d{1,3})?)\s*(UN|KG|G|L|LT|ML)?\s*[xX]\s*(\d+(?:[.,]\d{2}))\s*(?:[A-Z]\d{0,3})?\s+(\d+(?:[.,]\d{2}))$/i)
    if (nfce) {
      const barcode = nfce[1] || null
      const rawName = nfce[2].trim()
      const quantity = Number(nfce[3].replace(',', '.'))
      const unit = unitFromToken(nfce[4])
      const unitPrice = moneyToCents(nfce[5])
      const total = moneyToCents(nfce[6])
      const item = makeItem(rawName, barcode, quantity, unit, unitPrice, total, compact, 'high')
      items.push(item); lastPaidItem = item; continue
    }

    const erp = compact.match(/^\d{1,5}\s+(.+?)\s+(\d+(?:[.,]\d{3})?)\s*(UN|KG)\s+(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d{2}))$/i)
    if (erp) {
      const rawName = erp[1].trim()
      const quantity = Number(erp[2].replace(',', '.'))
      const unit = unitFromToken(erp[3])
      const unitPrice = moneyToCents(erp[4])
      const total = moneyToCents(erp[5])
      if (total === 0 && lastPaidItem) {
        lastPaidItem.notes = [lastPaidItem.notes, `Complemento: ${titleCase(rawName)}`].filter(Boolean).join(' · ')
      } else if (total > 0) {
        const item = makeItem(rawName, null, quantity, unit, unitPrice, total, compact, 'medium')
        items.push(item); lastPaidItem = item
      }
      continue
    }

    const delivery = compact.match(/^(\d+(?:[.,]\d+)?)\s*[xX]\s+(.+?)(?:\(|\s)+(?:R\$|RS)?\s*(\d+(?:[.,]\d{2}))/i)
    if (delivery) {
      const quantity = Number(delivery[1].replace(',', '.'))
      const rawName = delivery[2].replace(/[\[(].*$/, '').trim()
      const total = moneyToCents(delivery[3])
      if (total === 0 && lastPaidItem) {
        lastPaidItem.notes = [lastPaidItem.notes, `Acompanhamento: ${titleCase(rawName)}`].filter(Boolean).join(' · ')
      } else if (total > 0 && !/(taxa|desconto|subtotal|total)/i.test(rawName)) {
        const item = makeItem(rawName, null, quantity, 'unit', Math.round(total / Math.max(quantity, 1)), total, compact, 'medium')
        items.push(item); lastPaidItem = item
      }
      continue
    }

    const simpleDelivery = compact.match(/^(\d+)x\s+(.+?)\s+(?:R\$|RS)?\s*(\d+(?:[.,]\d{2}))$/i)
    if (simpleDelivery) {
      const quantity = Number(simpleDelivery[1])
      const rawName = simpleDelivery[2].trim()
      const total = moneyToCents(simpleDelivery[3])
      if (total === 0 && lastPaidItem) lastPaidItem.notes = [lastPaidItem.notes, `Acompanhamento: ${titleCase(rawName)}`].filter(Boolean).join(' · ')
      else if (total > 0) {
        const item = makeItem(rawName, null, quantity, 'unit', Math.round(total / quantity), total, compact, 'medium')
        items.push(item); lastPaidItem = item
      }
    }
  }

  return items
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const text = normalizeReceiptText(rawText)
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const sourceKind = detectSourceKind(text)
  const totals = detectTotals(lines)
  const items = parseItems(lines)
  const warnings: string[] = []

  if (!items.length) warnings.push('Não conseguimos separar os itens automaticamente. Você ainda pode adicioná-los manualmente na revisão.')
  if (!totals.total) warnings.push('O total da compra não foi identificado com segurança.')

  return {
    merchantName: detectMerchant(lines, sourceKind),
    merchantCnpj: detectCnpj(text),
    purchasedAt: parseLocalDate(text),
    paymentMethod: detectPayment(text),
    sourceKind,
    documentKey: detectDocumentKey(text),
    totalCents: totals.total,
    extraFeesCents: totals.fees,
    orderDiscountCents: totals.discount,
    items,
    warnings,
  }
}

function itemSignature(item: ParsedReceiptItem) {
  return [item.barcode || normalizeForMatch(item.name), item.quantity.toFixed(3), item.unitPriceCents, item.totalCents].join('|')
}

export function mergeReceiptParts(parts: ParsedReceipt[]): ParsedReceipt {
  const useful = parts.filter(Boolean)
  if (!useful.length) return parseReceiptText('')
  const best = [...useful].sort((a, b) => (b.items.length + Number(Boolean(b.totalCents)) * 3 + Number(Boolean(b.merchantName)) * 2) - (a.items.length + Number(Boolean(a.totalCents)) * 3 + Number(Boolean(a.merchantName)) * 2))[0]
  const mergedItems: ParsedReceiptItem[] = []
  const seen = new Set<string>()
  for (const part of useful) {
    for (const item of part.items) {
      const signature = itemSignature(item)
      if (seen.has(signature)) continue
      seen.add(signature)
      mergedItems.push(item)
    }
  }
  const warnings = [...new Set(useful.flatMap((part) => part.warnings))]
  if (useful.length > 1 && mergedItems.length < useful.reduce((sum, part) => sum + part.items.length, 0)) {
    warnings.unshift('Linhas repetidas entre as imagens foram removidas automaticamente.')
  }
  return {
    merchantName: useful.find((part) => part.merchantName)?.merchantName || best.merchantName,
    merchantCnpj: useful.find((part) => part.merchantCnpj)?.merchantCnpj || '',
    purchasedAt: useful.find((part) => part.purchasedAt)?.purchasedAt || '',
    paymentMethod: useful.find((part) => part.paymentMethod)?.paymentMethod || '',
    sourceKind: useful.find((part) => part.sourceKind === 'nfce')?.sourceKind || useful.find((part) => part.sourceKind === 'delivery')?.sourceKind || best.sourceKind,
    documentKey: useful.find((part) => part.documentKey)?.documentKey || '',
    totalCents: Math.max(...useful.map((part) => part.totalCents || 0)),
    extraFeesCents: Math.max(...useful.map((part) => part.extraFeesCents || 0)),
    orderDiscountCents: Math.max(...useful.map((part) => part.orderDiscountCents || 0)),
    items: mergedItems,
    warnings,
  }
}

function levenshtein(a: string, b: string) {
  if (!a) return b.length
  if (!b) return a.length
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = temp
    }
  }
  return previous[b.length]
}

export function similarityScore(a: string, b: string) {
  const left = normalizeForMatch(a)
  const right = normalizeForMatch(b)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return Math.min(0.94, Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.25)
  const leftTokens = new Set(left.split(' '))
  const rightTokens = new Set(right.split(' '))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size || 1
  const jaccard = intersection / union
  const distance = levenshtein(left, right)
  const editScore = 1 - distance / Math.max(left.length, right.length)
  return Math.max(0, Math.min(1, jaccard * 0.58 + editScore * 0.42))
}
