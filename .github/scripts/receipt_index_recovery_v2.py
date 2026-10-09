from pathlib import Path

path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

old = r'''function detectDeclaredItemCount(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|¦]/g, 'I')
    .toUpperCase()
  const lines = normalized.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const compact = lines.join(' ')
  const patterns = [
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+(?:I|1|L)?TENS?\D{0,12}([0O]*\d{1,3})\b/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const value = Number(match[1].replace(/O/g, '0'))
    if (Number.isFinite(value) && value > 0 && value <= 999) return value
  }

  const indexes = lines.map((line) => {
    const match = line.match(/^\s*0?(\d{1,2})\s+(?:(?:\d[\dO]{5,13})\s+)?[A-Z]/)
    return match ? Number(match[1]) : 0
  }).filter((value) => value > 0 && value <= 99)
  const unique = [...new Set(indexes)].sort((a, b) => a - b)
  if (unique.length >= 2 && unique[0] === 1) {
    const max = unique[unique.length - 1]
    const sequentialHits = unique.filter((value, index) => index === 0 || value > unique[index - 1]).length
    if (max >= 2 && sequentialHits >= Math.min(3, max)) return max
  }
  return null
}
'''
new = r'''function detectDeclaredItemCount(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|¦]/g, 'I')
    .toUpperCase()
  const lines = normalized.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const compact = lines.join(' ')

  const indexes = lines.map((line) => {
    const match = line.match(/^\s*0?(\d{1,2})\s+(?:(?:\d[\dO]{5,13})\s+)?[A-Z]/)
    return match ? Number(match[1]) : 0
  }).filter((value) => value > 0 && value <= 99)
  const unique = [...new Set(indexes)].sort((a, b) => a - b)
  const sequentialMax = unique.length >= 2 && unique[0] === 1
    ? unique.reduce((max, value) => value === max + 1 ? value : max, 0)
    : 0

  const patterns = [
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+(?:I|1|L)?TENS?\D{0,12}([0O]*\d{1,3})\b/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const value = Number(match[1].replace(/O/g, '0'))
    if (!Number.isFinite(value) || value <= 0 || value > 999) continue
    if (sequentialMax >= 3 && (value > sequentialMax * 2 || value - sequentialMax >= 10)) return sequentialMax
    if (sequentialMax >= 3 && value < sequentialMax) return sequentialMax
    return value
  }

  if (sequentialMax >= 2) return sequentialMax
  return null
}
'''
assert old in source, 'declared count function not found'
source = source.replace(old, new, 1)

old = """function confidenceLabel(value: ParsedReceiptItem['confidence']) {
  if (value === 'high') return 'Alta confiança'
  if (value === 'medium') return 'Revisar'
  return 'Baixa confiança'
}
"""
new = """function confidenceLabel(value: ParsedReceiptItem['confidence']) {
  if (value === 'high') return 'Alta confiança'
  if (value === 'medium') return 'Revisar'
  return 'Baixa confiança'
}

function isReviewItemComplete(item: ReviewItem) {
  const hasUsefulName = item.name.trim().length >= 2 && !/^Item \\d+ da nota$/i.test(item.name.trim())
  return hasUsefulName && item.quantity > 0 && item.unitPriceCents > 0
}
"""
assert old in source, 'confidence helper not found'
source = source.replace(old, new, 1)

old = """  const newProductsCount = draft?.items.filter((item) => item.productId === NEW_VALUE).length ?? 0
  const establishmentReady = Boolean(draft && draft.isNewEstablishment === false && draft.establishmentId)
  const purchaseDataReady = Boolean(establishmentReady && draft?.purchasedAt && draft?.paymentMethod)
"""
new = """  const newProductsCount = draft?.items.filter((item) => item.productId === NEW_VALUE).length ?? 0
  const structuredItemCount = draft?.items.filter(isReviewItemComplete).length ?? 0
  const incompleteItemCount = Math.max(0, (draft?.items.length ?? 0) - structuredItemCount)
  const itemsReady = Boolean(draft?.items.length && draft.items.every(isReviewItemComplete))
  const establishmentReady = Boolean(draft && draft.isNewEstablishment === false && draft.establishmentId)
  const purchaseDataReady = Boolean(establishmentReady && draft?.purchasedAt && draft?.paymentMethod)
"""
assert old in source, 'derived counts block not found'
source = source.replace(old, new, 1)

old = """    const countMatches = !draft.declaredItemCount || draft.declaredItemCount === draft.items.length
    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length
    if (totalMatches && countMatches && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'
    return 'partial'
  }, [draft, differenceCents])
"""
new = """    const countMatches = !draft.declaredItemCount || draft.declaredItemCount === structuredItemCount
    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length
    if (totalMatches && countMatches && incompleteItemCount === 0 && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'
    return 'partial'
  }, [draft, differenceCents, structuredItemCount, incompleteItemCount])
"""
assert old in source, 'quality block not found'
source = source.replace(old, new, 1)

old = """      if (item.productId === NEW_VALUE && !item.name.trim()) return setError('Preencha o nome de todos os produtos novos.')
      if (item.quantity <= 0) return setError('Revise as quantidades dos itens.')
"""
new = """      if (item.productId === NEW_VALUE && !item.name.trim()) return setError('Preencha o nome de todos os produtos novos.')
      if (!isReviewItemComplete(item)) return setError('Revise os itens incompletos. Todos precisam de nome, quantidade e preço unitário antes do registro.')
"""
assert old in source, 'item validation block not found'
source = source.replace(old, new, 1)

old = """                <span className={draft.declaredItemCount === draft.items.length ? 'ok' : 'warn'}>
                  <small>Itens encontrados</small>
                  <b>{draft.declaredItemCount ? `${draft.items.length}/${draft.declaredItemCount} itens encontrados` : `${draft.items.length} ${draft.items.length === 1 ? 'item encontrado' : 'itens encontrados'}`}</b>
                  <em>{draft.declaredItemCount ? `A nota informa ${draft.declaredItemCount} itens no total.` : 'A quantidade total da nota não pôde ser lida com segurança.'}</em>
                </span>
"""
new = """                <span className={draft.declaredItemCount === structuredItemCount && incompleteItemCount === 0 ? 'ok' : 'warn'}>
                  <small>Itens encontrados</small>
                  <b>{draft.declaredItemCount ? `${structuredItemCount}/${draft.declaredItemCount} itens identificados` : `${structuredItemCount} ${structuredItemCount === 1 ? 'item identificado' : 'itens identificados'}`}</b>
                  <em>{draft.declaredItemCount ? (incompleteItemCount > 0 ? `${incompleteItemCount} ${incompleteItemCount === 1 ? 'linha da nota foi preservada e precisa' : 'linhas da nota foram preservadas e precisam'} de revisão.` : `A nota informa ${draft.declaredItemCount} itens no total.`) : 'A quantidade total da nota não pôde ser lida com segurança.'}</em>
                </span>
"""
assert old in source, 'quality item summary not found'
source = source.replace(old, new, 1)

old = """            <section className=\"receipt-review-card\"><div className=\"receipt-stage-heading\"><div><span className=\"page-kicker\">ITENS IDENTIFICADOS</span><h3>{draft.items.length === 0 ? 'Nenhum item identificado' : `${draft.items.length} ${draft.items.length === 1 ? 'item para revisar' : 'itens para revisar'}`}</h3></div><button className=\"ghost-button\" type=\"button\" onClick={()=>updateDraft({items:[...draft.items,makeBlankItem()]})}>+ Adicionar item</button></div>
"""
new = """            <section className=\"receipt-review-card\"><div className=\"receipt-stage-heading\"><div><span className=\"page-kicker\">ITENS IDENTIFICADOS</span><h3>{draft.items.length === 0 ? 'Nenhum item identificado' : incompleteItemCount > 0 ? `${structuredItemCount} identificados · ${incompleteItemCount} para completar` : `${draft.items.length} ${draft.items.length === 1 ? 'item para revisar' : 'itens para revisar'}`}</h3></div><button className=\"ghost-button\" type=\"button\" onClick={()=>updateDraft({items:[...draft.items,makeBlankItem()]})}>+ Adicionar item</button></div>
"""
assert old in source, 'items heading not found'
source = source.replace(old, new, 1)

old = '<article className="receipt-review-item" key={item.key}>'
new = '<article className={`receipt-review-item ${isReviewItemComplete(item) ? \'\' : \'incomplete\'}`} key={item.key}>'
assert old in source, 'review item article not found'
source = source.replace(old, new)

old = """<button className=\"button button-primary\" type=\"button\" onClick={requestRegistration} disabled={!draft.items.length || Boolean(duplicatePurchaseId) || isPending || !purchaseDataReady}>Registrar compra</button>"""
new = """<button className=\"button button-primary\" type=\"button\" onClick={requestRegistration} disabled={!itemsReady || Boolean(duplicatePurchaseId) || isPending || !purchaseDataReady}>Registrar compra</button>"""
assert old in source, 'register button not found'
source = source.replace(old, new, 1)

path.write_text(source, encoding='utf-8')

css_path = Path('src/app/receipt-quality.css')
css = css_path.read_text(encoding='utf-8')
addition = r'''

/* Indexed NFC-e recovery */
.receipt-review-item.incomplete { border-color:rgba(240,207,135,.34); background:linear-gradient(135deg,rgba(240,207,135,.035),#101011 38%); }
.receipt-review-item.incomplete .receipt-confidence { border-color:rgba(240,207,135,.28); color:#e4bd60; }
'''
if '/* Indexed NFC-e recovery */' not in css:
    css += addition
css_path.write_text(css, encoding='utf-8')
