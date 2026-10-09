from pathlib import Path

# Patch smart parser
path = Path('src/lib/receipt-parser-smart.ts')
source = path.read_text(encoding='utf-8')

source = source.replace("""    if (insideItems && /(qtd\\s*total.*itens|total\\s*de\\s*itens|valor\\s*total)/.test(normalized)) {
      flush()
      break
    }
""", """    if (insideItems && /(qtd\\s*total|total\\s*de\\s*itens|valor\\s*total|cartao\\s*(?:de)?bito|consulte\\s+pela)/.test(normalized)) {
      flush()
      break
    }
""", 1)

marker = """function parseIndexedBlock(block: IndexedBlock): SmartItem {\n"""
visual = r'''function extractVisualBlocks(rawText: string) {
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
    if (!insideItems) continue
    if (/(qtd\s*total|valor\s*total|total\s*de\s*itens|cartao\s*(?:de)?bito|consulte\s+pela)/.test(normalized)) {
      flush()
      break
    }

    const continuation = /^\W*[A-Z]?\s*(?:\d+(?:[.,]\d{1,3})?\s*)?(?:UN|KG|G|L|LT|ML)\b/i.test(line)
      || /^\W*\d+(?:[.,]\d{1,3})?\s*(?:UN|KG|G|L|LT|ML)\b/i.test(line)
    const hasDescription = /[A-Za-zÀ-ÿ]{3,}/.test(line)
    const hasProductShape = hasDescription && !continuation

    if (hasProductShape) {
      flush()
      current = { index: blocks.length + 1, lines: [line], sourceLine: line }
    } else if (current) {
      current.lines.push(line)
    }
  }
  flush()
  return blocks
}

'''
assert marker in source
source = source.replace(marker, visual + marker, 1)

source = source.replace("""  const indexedBlocks = extractIndexedBlocks(rawText)
  const indexedItems = indexedBlocks.map(parseIndexedBlock)

  const candidates = [...(base.items as any[]), ...fallback, ...indexedItems]
""", """  const indexedBlocks = extractIndexedBlocks(rawText)
  const visualBlocks = base.sourceKind === 'nfce' ? extractVisualBlocks(rawText) : []
  const receiptBlocks = visualBlocks.length > indexedBlocks.length ? visualBlocks : indexedBlocks
  const indexedItems = receiptBlocks.map(parseIndexedBlock)

  const candidates = [...(base.items as any[]), ...fallback, ...indexedItems]
""", 1)

source = source.replace("""  if (indexedBlocks.length) warnings.unshift(`${indexedBlocks.length} linha(s) numerada(s) da nota foram preservadas para conferência.`)
""", """  if (receiptBlocks.length) warnings.unshift(`${receiptBlocks.length} linha(s) de produto da nota foram preservadas para conferência.`)
""", 1)

path.write_text(source, encoding='utf-8')

# Patch importer
path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

old = r'''  const patterns = [
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+(?:I|1|L)?TENS?\D{0,12}([0O]*\d{1,3})\b/i,
  ]
'''
new = r'''  const patterns = [
    /QTD\W{0,4}TOTAL(?:\s+DE)?[^0-9]{0,20}([0O]{0,2}\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+(?:I|1|L)?TENS?\D{0,12}([0O]*\d{1,3})\b/i,
  ]
'''
assert old in source
source = source.replace(old, new, 1)

old = """    if (sequentialMax >= 3 && (value > sequentialMax * 2 || value - sequentialMax >= 10)) return sequentialMax
    if (sequentialMax >= 3 && value < sequentialMax) return sequentialMax
    return value
"""
new = """    const observedMax = unique.length ? unique[unique.length - 1] : 0
    if (observedMax >= 3 && value < observedMax) return observedMax
    if (sequentialMax >= 3 && (value > Math.max(observedMax, sequentialMax) * 2 || value - Math.max(observedMax, sequentialMax) >= 10)) return Math.max(observedMax, sequentialMax)
    return value
"""
assert old in source
source = source.replace(old, new, 1)

old = """function isReviewItemComplete(item: ReviewItem) {
  const hasUsefulName = item.name.trim().length >= 2 && !/^Item \\d+ da nota$/i.test(item.name.trim())
  return hasUsefulName && item.quantity > 0 && item.unitPriceCents > 0
}
"""
new = """function isReviewItemComplete(item: ReviewItem) {
  const hasUsefulName = item.name.trim().length >= 2 && !/^Item \\d+ da nota$/i.test(item.name.trim())
  if (!hasUsefulName || item.quantity <= 0 || item.unitPriceCents <= 0) return false
  if (item.totalCents > 0) {
    const calculated = Math.round(item.quantity * item.unitPriceCents)
    const tolerance = Math.max(3, Math.round(item.totalCents * .01))
    if (Math.abs(calculated - item.totalCents) > tolerance) return false
  }
  return true
}

function receiptItemIndex(item: ReviewItem) {
  const match = item.sourceLine?.trim().match(/^0?(\\d{1,2})\\b/)
  const value = match ? Number(match[1]) : 0
  return value >= 1 && value <= 99 ? value : 0
}

function makeMissingReceiptItem(index: number): ReviewItem {
  return {
    ...makeBlankItem(),
    key: `missing-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rawName: `Item ${String(index).padStart(2, '0')} da nota`,
    name: `Item ${String(index).padStart(2, '0')} da nota`,
    sourceLine: `${String(index).padStart(2, '0')} item não interpretado pelo leitor`,
    notes: `A linha ${String(index).padStart(2, '0')} foi detectada na estrutura da nota, mas precisa ser preenchida manualmente.`,
    confidence: 'low',
  }
}

function ensureDeclaredItemSlots(items: ReviewItem[], declaredCount: number | null) {
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
"""
assert old in source
source = source.replace(old, new, 1)

old = """  const itemNetCents = useMemo(() => draft?.items.reduce((sum, item) => sum + Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents), 0) ?? 0, [draft])
  const calculatedTotalCents = draft ? Math.max(0, itemNetCents + draft.extraFeesCents - draft.orderDiscountCents) : 0
"""
new = """  const itemNetCents = useMemo(() => draft?.items.reduce((sum, item) => sum + Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents), 0) ?? 0, [draft])
  const identifiedValueCents = useMemo(() => draft?.items.reduce((sum, item) => {
    if (!isReviewItemComplete(item)) return sum
    return sum + Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents)
  }, 0) ?? 0, [draft])
  const calculatedTotalCents = draft ? Math.max(0, itemNetCents + draft.extraFeesCents - draft.orderDiscountCents) : 0
"""
assert old in source
source = source.replace(old, new, 1)

source = source.replace("""    const tolerance = draft.totalCents ? Math.max(5, Math.round(draft.totalCents * .03)) : 0
    const totalMatches = !draft.totalCents || Math.abs(differenceCents) <= tolerance
""", """    const tolerance = draft.totalCents ? 5 : 0
    const totalMatches = !draft.totalCents || Math.abs(calculatedTotalCents - draft.totalCents) <= tolerance
""", 1)
source = source.replace("""  }, [draft, differenceCents, structuredItemCount, incompleteItemCount])
""", """  }, [draft, calculatedTotalCents, structuredItemCount, incompleteItemCount])
""", 1)

old = """      const parsed = mergeReceiptParts(parts)
      const fingerprint = await buildFingerprint(parsed)
      const review: ReviewDraft = {
        ...parsed,
        purchasedAt: '',
        fingerprint,
        establishmentId: '',
        isNewEstablishment: null,
        declaredItemCount: detectDeclaredItemCount(texts.join('\\n')),
        items: parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) })),
      }
"""
new = """      const parsed = mergeReceiptParts(parts)
      const fingerprint = await buildFingerprint(parsed)
      const declaredItemCount = detectDeclaredItemCount(texts.join('\\n'))
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
"""
assert old in source
source = source.replace(old, new, 1)

old = """  function updateDraft(patch: Partial<ReviewDraft>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  function updateItem(key: string, patch: Partial<ReviewItem>) { setDraft((current) => current ? { ...current, items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item) } : current) }
"""
new = """  function updateDraft(patch: Partial<ReviewDraft>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  function updateItem(key: string, patch: Partial<ReviewItem>) {
    setDraft((current) => current ? { ...current, items: current.items.map((item) => {
      if (item.key !== key) return item
      const next = { ...item, ...patch }
      if ('quantity' in patch || 'unitPriceCents' in patch) next.totalCents = Math.max(0, Math.round(next.quantity * next.unitPriceCents))
      return next
    }) } : current)
  }
"""
assert old in source
source = source.replace(old, new, 1)

old = """                <span className={!draft.totalCents || Math.abs(differenceCents) <= Math.max(5, Math.round(draft.totalCents * .03)) ? 'ok' : 'warn'}>
                  <small>Valor encontrado</small>
                  <b>{draft.totalCents ? `${formatBRL(calculatedTotalCents)} de ${formatBRL(draft.totalCents)}` : formatBRL(calculatedTotalCents)}</b>
"""
new = """                <span className={!draft.totalCents || Math.abs(identifiedValueCents - draft.totalCents) <= 5 ? 'ok' : 'warn'}>
                  <small>Valor identificado</small>
                  <b>{draft.totalCents ? `${formatBRL(identifiedValueCents)} de ${formatBRL(draft.totalCents)}` : formatBRL(identifiedValueCents)}</b>
"""
assert old in source
source = source.replace(old, new, 1)

path.write_text(source, encoding='utf-8')
