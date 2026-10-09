from pathlib import Path

# --- receipt-parser-smart.ts ---
path = Path('src/lib/receipt-parser-smart.ts')
source = path.read_text(encoding='utf-8')

old = r'''    const continuation = /^\W*[A-Z]?\s*(?:\d+(?:[.,]\d{1,3})?\s*)?(?:UN|KG|G|L|LT|ML)\b/i.test(line)
      || /^\W*\d+(?:[.,]\d{1,3})?\s*(?:UN|KG|G|L|LT|ML)\b/i.test(line)
    const hasDescription = /[A-Za-zÀ-ÿ]{3,}/.test(line)
    const hasProductShape = hasDescription && !continuation

    if (hasProductShape) {
      flush()
      current = { index: blocks.length + 1, lines: [line], sourceLine: line }
    } else if (current) {
      current.lines.push(line)
    }
'''
new = r'''    const continuation = /^\W*[A-Z]?\s*(?:\d+(?:[.,]\d{1,3})?\s*)?(?:UN|KG|G|L|LT|ML)\b/i.test(line)
      || /^\W*\d+(?:[.,]\d{1,3})?\s*(?:UN|KG|G|L|LT|ML)\b/i.test(line)
    const head = line.slice(0, 38)
    const barcodeLike = /\d{7,14}/.test(head)
    const hasDescription = /[A-Za-zÀ-ÿ]{3,}/.test(line)
    const hasProductShape = barcodeLike && hasDescription && !continuation

    if (hasProductShape) {
      flush()
      current = { index: blocks.length + 1, lines: [line], sourceLine: line }
    } else if (current) {
      current.lines.push(line)
    }
'''
assert old in source, 'visual block section not found'
source = source.replace(old, new, 1)

old = r'''  const indexedBlocks = extractIndexedBlocks(rawText)
  const visualBlocks = base.sourceKind === 'nfce' ? extractVisualBlocks(rawText) : []
  const receiptBlocks = visualBlocks.length > indexedBlocks.length ? visualBlocks : indexedBlocks
  const indexedItems = receiptBlocks.map(parseIndexedBlock)

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

  if (receiptBlocks.length) warnings.unshift(`${receiptBlocks.length} linha(s) de produto da nota foram preservadas para conferência.`)
  if (recovered) warnings.unshift(`${recovered} item(ns) adicionais foram recuperados automaticamente e precisam de revisão.`)
  if (incomplete) warnings.unshift(`${incomplete} item(ns) não foram interpretados por completo e foram mantidos para preenchimento manual.`)

  return { ...base, items, warnings } as typeof base
'''
new = r'''  const indexedBlocks = extractIndexedBlocks(rawText)
  const visualBlocks = base.sourceKind === 'nfce' ? extractVisualBlocks(rawText) : []
  const receiptBlocks = visualBlocks.length >= 3 ? visualBlocks : indexedBlocks
  const indexedItems = receiptBlocks.map(parseIndexedBlock)

  // NFC-e possui uma tabela de produtos. Quando conseguimos reconstruir essa tabela,
  // ela passa a ser a fonte canônica e não anexamos candidatos extras fora dela.
  let items: any[]
  if (base.sourceKind === 'nfce' && receiptBlocks.length >= 3) {
    items = indexedItems
  } else {
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
    items = [...indexedResult, ...extras]
  }

  // Detalhes técnicos de recuperação ficam internos; a UI já apresenta o resumo de revisão.
  const warnings = base.warnings.filter((warning) =>
    !warning.startsWith('Não conseguimos separar os itens automaticamente') &&
    !/(recuperad|preservad|interpretad por completo)/i.test(warning)
  )

  return { ...base, items, warnings } as typeof base
'''
assert old in source, 'smart parser result block not found'
source = source.replace(old, new, 1)
path.write_text(source, encoding='utf-8')

# --- receipt-importer-v2.tsx ---
path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

old = r'''  const indexes = lines.map((line) => {
    const match = line.match(/^\s*0?(\d{1,2})\s+(?:(?:\d[\dO]{5,13})\s+)?[A-Z]/)
    return match ? Number(match[1]) : 0
  }).filter((value) => value > 0 && value <= 99)
'''
new = r'''  const indexes = lines.map((line) => {
    // Só consideramos índice quando a mesma linha também parece uma linha real de produto.
    const match = line.match(/^\s*0?(\d{1,2})\s+(?:\d[\dO]{7,13})\s+[A-ZÀ-Ý]/)
    return match ? Number(match[1]) : 0
  }).filter((value) => value > 0 && value <= 99)
'''
assert old in source, 'index detector not found'
source = source.replace(old, new, 1)

marker = """function productLabel(product: ProductOption) {\n"""
helper = r'''function detectLikelyProductRowCount(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  const lines = normalized.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  let insideItems = false
  let count = 0
  for (const line of lines) {
    if (/DESCRI/.test(line) && /(QTD|VL|TOTAL|CODIGO)/.test(line)) { insideItems = true; continue }
    if (!insideItems) continue
    if (/(QTD\W*TOTAL|VALOR\W*TOTAL|CARTAO|CONSULTE\W+PELA)/.test(line)) break
    const head = line.slice(0, 38)
    if (/\d{7,14}/.test(head) && /[A-Z]{3,}/.test(line)) count++
  }
  return count
}

function resolveDeclaredItemCount(texts: string[], parsedItemCount: number) {
  const joined = texts.join('\n')
  const declared = detectDeclaredItemCount(joined)
  const visualCount = Math.max(0, ...texts.map(detectLikelyProductRowCount))

  // Em NFC-e, a quantidade de linhas de produto com código é uma evidência forte.
  // Se ela coincide com o que o parser canônico reconstruiu, usamos esse número.
  if (visualCount >= 3 && parsedItemCount === visualCount) return visualCount
  if (declared && declared >= 1 && declared <= 60) return declared
  if (visualCount >= 3) return visualCount
  return parsedItemCount > 0 ? parsedItemCount : null
}

'''
assert marker in source, 'productLabel marker not found'
source = source.replace(marker, helper + marker, 1)

old = r'''function ensureDeclaredItemSlots(items: ReviewItem[], declaredCount: number | null) {
  if (!declaredCount || declaredCount < 1 || declaredCount > 60 || items.length >= declaredCount) return items
  const indexed = new Map<number, ReviewItem>()
  const unindexed: ReviewItem[] = []
  for (const item of items) {
    const index = receiptItemIndex(item)
    if (index && !indexed.has(index)) indexed.set(index, item)
    else unindexed.push(item)
  }
  if (indexed.size < 2) return items
  let missingNeeded = declaredCount - items.length
  const result: ReviewItem[] = []
  for (let index = 1; index <= declaredCount; index++) {
    const existing = indexed.get(index)
    if (existing) result.push(existing)
    else if (missingNeeded > 0) { result.push(makeMissingReceiptItem(index)); missingNeeded-- }
  }
  result.push(...unindexed)
  return result
}
'''
new = r'''function ensureDeclaredItemSlots(items: ReviewItem[], declaredCount: number | null) {
  if (!declaredCount || declaredCount < 1 || declaredCount > 60) return items

  const indexed = new Map<number, ReviewItem>()
  const unindexed: ReviewItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const signature = `${item.barcode || normalizeForMatch(item.name)}|${item.quantity.toFixed(3)}|${item.unitPriceCents}|${item.totalCents}`
    if (seen.has(signature)) continue
    seen.add(signature)
    const index = receiptItemIndex(item)
    if (index >= 1 && index <= declaredCount && !indexed.has(index)) indexed.set(index, item)
    else unindexed.push(item)
  }

  const result: ReviewItem[] = []
  for (let index = 1; index <= declaredCount; index++) {
    const indexedItem = indexed.get(index)
    if (indexedItem) {
      result.push(indexedItem)
      continue
    }
    const fallback = unindexed.shift()
    result.push(fallback ?? makeMissingReceiptItem(index))
  }

  // Regra de invariância: uma revisão nunca pode ter mais slots que o total declarado.
  return result.slice(0, declaredCount)
}
'''
assert old in source, 'ensure slots function not found'
source = source.replace(old, new, 1)

old = r'''      const declaredItemCount = detectDeclaredItemCount(texts.join('\n'))
      const mappedItems = parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) }))
      const reviewItems = ensureDeclaredItemSlots(mappedItems, declaredItemCount)
      const review: ReviewDraft = {
        ...parsed,
        purchasedAt: '',
        fingerprint,
        establishmentId: '',
        isNewEstablishment: null,
        declaredItemCount: declaredItemCount ? Math.max(declaredItemCount, reviewItems.length) : (reviewItems.length || null),
        items: reviewItems,
      }
'''
new = r'''      const mappedItems = parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) }))
      const declaredItemCount = resolveDeclaredItemCount(texts, mappedItems.length)
      const reviewItems = ensureDeclaredItemSlots(mappedItems, declaredItemCount)
      const review: ReviewDraft = {
        ...parsed,
        purchasedAt: '',
        fingerprint,
        establishmentId: '',
        isNewEstablishment: null,
        declaredItemCount: declaredItemCount ?? (reviewItems.length || null),
        items: reviewItems,
      }
'''
assert old in source, 'review construction not found'
source = source.replace(old, new, 1)

old = r'''            {draft.warnings.length ? <div className="receipt-review-warnings">{draft.warnings.map((warning) => <span key={warning}>! {warning}</span>)}</div> : null}
'''
new = r'''            {draft.warnings.filter((warning) => !/(recuperad|preservad|interpretad|linha\(s\)|item\(ns\))/i.test(warning)).length ? <div className="receipt-review-warnings">{draft.warnings.filter((warning) => !/(recuperad|preservad|interpretad|linha\(s\)|item\(ns\))/i.test(warning)).map((warning) => <span key={warning}>! {warning}</span>)}</div> : null}
'''
assert old in source, 'warnings render not found'
source = source.replace(old, new, 1)

path.write_text(source, encoding='utf-8')
