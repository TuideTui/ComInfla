from pathlib import Path
import re

importer_path = Path('src/components/receipt-importer-v2.tsx')
smart_path = Path('src/lib/receipt-parser-smart.ts')

source = importer_path.read_text(encoding='utf-8')
smart = smart_path.read_text(encoding='utf-8')

# 1) Troca a antiga segunda leitura de contagem por uma leitura focada na tabela de produtos.
pattern = re.compile(r"async function extractReceiptSummaryText\(canvas: HTMLCanvasElement, worker: any\) \{.*?\n\}\n\nasync function extractPdfText", re.S)
replacement = r'''async function extractReceiptItemsText(canvas: HTMLCanvasElement, worker: any) {
  // Segunda leitura dedicada à tabela da NFC-e. O objetivo aqui não é descobrir
  // quantos itens deveriam existir, e sim recuperar melhor nome, quantidade,
  // unidade, preço unitário e total de cada linha visível.
  const passes = [
    { y: .10, h: .54, contrast: 1.55, low: 96, high: 188 },
    { y: .16, h: .48, contrast: 1.85, low: 112, high: 178 },
  ]
  const outputs: string[] = []

  for (const pass of passes) {
    const sourceX = Math.round(canvas.width * .035)
    const sourceY = Math.round(canvas.height * pass.y)
    const sourceWidth = Math.round(canvas.width * .93)
    const sourceHeight = Math.min(Math.round(canvas.height * pass.h), canvas.height - sourceY)
    if (sourceHeight <= 0 || sourceWidth <= 0) continue

    const scale = 2.35
    const crop = document.createElement('canvas')
    crop.width = Math.max(1, Math.round(sourceWidth * scale))
    crop.height = Math.max(1, Math.round(sourceHeight * scale))
    const context = crop.getContext('2d', { willReadFrequently: true })
    if (!context) continue
    context.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height)

    const pixels = context.getImageData(0, 0, crop.width, crop.height)
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] * .299 + pixels.data[index + 1] * .587 + pixels.data[index + 2] * .114
      const boosted = Math.max(0, Math.min(255, (gray - 128) * pass.contrast + 128))
      const value = boosted >= pass.high ? 255 : boosted <= pass.low ? 0 : boosted
      pixels.data[index] = value
      pixels.data[index + 1] = value
      pixels.data[index + 2] = value
    }
    context.putImageData(pixels, 0, 0)

    const result = await worker.recognize(crop)
    const text = String(result?.data?.text ?? '').trim()
    if (text) outputs.push(text)
  }

  return outputs.join('\n')
}

async function extractPdfText'''
if not pattern.search(source):
    raise SystemExit('extractReceiptSummaryText block not found')
source = pattern.sub(lambda _: replacement, source, count=1)

source = source.replace("      const countHints: string[] = []\n", "", 1)

old_image = '''          const result = await ocrWorker.recognize(canvas)\n          text = result?.data?.text ?? ''\n\n          const initialDeclared = detectDeclaredItemCount(text)\n          const initialVisual = detectLikelyProductRowCount(text)\n          const suspiciousCount = !initialDeclared || (initialVisual >= 2 && Math.abs(initialDeclared - initialVisual) >= 4)\n          if (suspiciousCount) {\n            setProgressText('Conferindo a quantidade total de itens da nota…')\n            const summaryText = await extractReceiptSummaryText(canvas, ocrWorker)\n            if (summaryText) countHints.push(summaryText)\n          }\n'''
new_image = '''          const result = await ocrWorker.recognize(canvas)\n          text = result?.data?.text ?? ''\n\n          const likelyNfce = /(NOTA\\s+FISCAL|NFC.?E|DOCUMENTO\\s+AUXILIAR|SQ.?CODIGO|VL.?UNIT)/i.test(text)\n          if (likelyNfce) {\n            setProgressText('Refinando a leitura da tabela de produtos…')\n            const itemsText = await extractReceiptItemsText(canvas, ocrWorker)\n            if (itemsText) text = `${text}\\n\\n──────── TABELA DE PRODUTOS ────────\\n${itemsText}`\n          }\n'''
if old_image not in source:
    raise SystemExit('image OCR block not found')
source = source.replace(old_image, new_image, 1)

old_review = '''      const mappedItems = parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) }))\n      const declaredItemCount = resolveDeclaredItemCount([...countHints, ...texts], mappedItems.length)\n      const reviewItems = ensureDeclaredItemSlots(mappedItems, declaredItemCount)\n      const review: ReviewDraft = {\n        ...parsed,\n        purchasedAt: '',\n        fingerprint,\n        establishmentId: '',\n        isNewEstablishment: null,\n        declaredItemCount: declaredItemCount ?? (reviewItems.length || null),\n        items: reviewItems,\n      }\n'''
new_review = '''      const reviewItems = parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) }))\n      const review: ReviewDraft = {\n        ...parsed,\n        purchasedAt: '',\n        fingerprint,\n        establishmentId: '',\n        isNewEstablishment: null,\n        declaredItemCount: null,\n        items: reviewItems,\n      }\n'''
if old_review not in source:
    raise SystemExit('review item construction block not found')
source = source.replace(old_review, new_review, 1)

old_quality = '''    const totalMatches = !draft.totalCents || Math.abs(calculatedTotalCents - draft.totalCents) <= tolerance\n    const countMatches = !draft.declaredItemCount || draft.declaredItemCount === structuredItemCount\n    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length\n    if (totalMatches && countMatches && incompleteItemCount === 0 && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'\n'''
new_quality = '''    const totalMatches = !draft.totalCents || Math.abs(calculatedTotalCents - draft.totalCents) <= tolerance\n    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length\n    if (totalMatches && incompleteItemCount === 0 && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'\n'''
if old_quality not in source:
    raise SystemExit('quality count block not found')
source = source.replace(old_quality, new_quality, 1)

old_summary = '''                <span className={draft.declaredItemCount === structuredItemCount && incompleteItemCount === 0 ? 'ok' : 'warn'}>\n                  <small>Itens encontrados</small>\n                  <b>{draft.declaredItemCount ? `${structuredItemCount}/${draft.declaredItemCount} itens identificados` : `${structuredItemCount} ${structuredItemCount === 1 ? 'item identificado' : 'itens identificados'}`}</b>\n                  <em>{draft.declaredItemCount ? (incompleteItemCount > 0 ? `${incompleteItemCount} ${incompleteItemCount === 1 ? 'linha da nota foi preservada e precisa' : 'linhas da nota foram preservadas e precisam'} de revisão.` : `A nota informa ${draft.declaredItemCount} itens no total.`) : 'A quantidade total da nota não pôde ser lida com segurança.'}</em>\n                </span>\n                <span className={!draft.totalCents || Math.abs(identifiedValueCents - draft.totalCents) <= 5 ? 'ok' : 'warn'}>\n                  <small>Valor identificado</small>\n                  <b>{draft.totalCents ? `${formatBRL(identifiedValueCents)} de ${formatBRL(draft.totalCents)}` : formatBRL(identifiedValueCents)}</b>\n                  <em>{draft.totalCents ? `Total informado na nota: ${formatBRL(draft.totalCents)}.` : 'O total impresso na nota não pôde ser identificado.'}</em>\n                </span>\n'''
new_summary = '''                <span className={structuredItemCount > 0 ? 'ok' : 'warn'}>\n                  <small>Itens identificados</small>\n                  <b>{structuredItemCount} {structuredItemCount === 1 ? 'item identificado' : 'itens identificados'}</b>\n                  <em>{incompleteItemCount > 0 ? `${incompleteItemCount} ${incompleteItemCount === 1 ? 'item precisa' : 'itens precisam'} de revisão antes do registro.` : 'Revise nomes, quantidades e preços antes de registrar.'}</em>\n                </span>\n                <span className={!draft.totalCents || Math.abs(identifiedValueCents - draft.totalCents) <= 5 ? 'ok' : 'warn'}>\n                  <small>Valor identificado</small>\n                  <b>{draft.totalCents ? `${formatBRL(identifiedValueCents)} de ${formatBRL(draft.totalCents)}` : formatBRL(identifiedValueCents)}</b>\n                  <em>{draft.totalCents ? (draft.totalCents - identifiedValueCents > 5 ? `Ainda faltam ${formatBRL(draft.totalCents - identifiedValueCents)} para explicar o total da nota.` : identifiedValueCents - draft.totalCents > 5 ? `Os itens identificados superam o total da nota em ${formatBRL(identifiedValueCents - draft.totalCents)}.` : 'Os valores identificados explicam o total da nota.') : 'O total impresso na nota não pôde ser identificado.'}</em>\n                </span>\n'''
if old_summary not in source:
    raise SystemExit('summary UI block not found')
source = source.replace(old_summary, new_summary, 1)

importer_path.write_text(source, encoding='utf-8')

# 2) Melhora a leitura semântica dos produtos no parser inteligente.
old_presentation = '''function inferPresentation(rawName: string) {\n  const size = rawName.match(/(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(ML|LT|L|KG|G)\\b/i)\n  if (!size) return null\n  const unit = size[2].toLowerCase() === 'lt' ? 'l' : size[2].toLowerCase()\n  return `${size[1].replace('.', ',')} ${unit}`\n}\n'''
new_presentation = '''function inferPresentation(rawName: string) {\n  const size = rawName.match(/(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(ML|LT|L|KG|G)\\b/i)\n  if (size) {\n    const unit = size[2].toLowerCase() === 'lt' ? 'l' : size[2].toLowerCase()\n    return `${size[1].replace('.', ',')} ${unit}`\n  }\n  const pack = rawName.match(/\\bC\\s*[/\\-]?\\s*(\\d{1,3})\\b/i)\n  if (pack) return `${pack[1]} unidades`\n  return null\n}\n'''
if old_presentation not in smart:
    raise SystemExit('inferPresentation block not found')
smart = smart.replace(old_presentation, new_presentation, 1)

smart = smart.replace("    .replace(/\\bLEITE\\s+INT\\b/gi, 'Leite Integral')\n", "    .replace(/\\bLEITE\\s+INT\\b/gi, 'Leite Integral')\n    .replace(/\\bÁGUA\\s+MIN\\b/gi, 'Água Mineral')\n    .replace(/\\bAGUA\\s+MIN\\b/gi, 'Água Mineral')\n    .replace(/\\bSELEC\\b/gi, 'Select')\n", 1)

old_remove_presentation = '''  if (presentation) {\n    const [amount, unit] = presentation.split(' ')\n    const units = unit === 'l' ? '(?:L|LT)' : unit.toUpperCase()\n    name = name.replace(new RegExp(`\\\\s${amount.replace(',', '[,.]')}\\\\s*${units}\\\\b`, 'i'), '').trim()\n  }\n'''
new_remove_presentation = '''  if (presentation) {\n    const [amount, unit] = presentation.split(' ')\n    if (unit === 'unidades') name = name.replace(new RegExp(`\\\\bC\\\\s*[/\\\\-]?\\\\s*${amount}\\\\b`, 'i'), '').trim()\n    else {\n      const units = unit === 'l' ? '(?:L|LT)' : unit.toUpperCase()\n      name = name.replace(new RegExp(`\\\\s${amount.replace(',', '[,.]')}\\\\s*${units}\\\\b`, 'i'), '').trim()\n    }\n  }\n'''
if old_remove_presentation not in smart:
    raise SystemExit('presentation cleanup block not found')
smart = smart.replace(old_remove_presentation, new_remove_presentation, 1)

# Adiciona um segmentador forte baseado em código longo de produto.
marker = 'function parseIndexedBlock(block: IndexedBlock): SmartItem {'
barcode_helper = r'''function extractBarcodeBlocks(rawText: string) {
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

  for (const original of lines) {
    const normalized = normalizeForMatch(original)
    if (/\\b(descricao|descric[aã]o)\\b/.test(normalized) && /(qtd|vl|total|codigo)/.test(normalized)) {
      insideItems = true
      continue
    }
    if (!insideItems) continue
    if (/(qtd\\s*total|valor\\s*total|total\\s*de\\s*itens|cartao\\s*(?:de)?bito|consulte\\s+pela)/.test(normalized)) {
      flush()
      break
    }

    const corrected = original.replace(/[OQ]/g, '0').replace(/[IL]/g, '1')
    const start = corrected.match(/^\\s*(?:\\d{1,2}\\s+)?(\\d{8,14})\\s+(.+)$/)
    if (start && /[A-Za-zÀ-ÿ]{2,}/.test(start[2])) {
      flush()
      const syntheticIndex = blocks.length + 1
      const alreadyIndexed = /^\\s*\\d{1,2}\\s+\\d{8,14}\\s+/.test(corrected)
      current = { index: syntheticIndex, lines: [alreadyIndexed ? original : `${syntheticIndex} ${original}`], sourceLine: original }
      continue
    }

    if (current) current.lines.push(original)
  }
  flush()
  return blocks
}

'''
if marker not in smart:
    raise SystemExit('parseIndexedBlock marker not found')
smart = smart.replace(marker, barcode_helper + marker, 1)

old_blocks = '''  const indexedBlocks = extractIndexedBlocks(rawText)\n  const visualBlocks = base.sourceKind === 'nfce' ? extractVisualBlocks(rawText) : []\n  const receiptBlocks = visualBlocks.length > indexedBlocks.length ? visualBlocks : indexedBlocks\n  const indexedItems = receiptBlocks.map(parseIndexedBlock)\n'''
new_blocks = '''  const indexedBlocks = extractIndexedBlocks(rawText)\n  const visualBlocks = base.sourceKind === 'nfce' ? extractVisualBlocks(rawText) : []\n  const barcodeBlocks = base.sourceKind === 'nfce' ? extractBarcodeBlocks(rawText) : []\n  const receiptBlocks = barcodeBlocks.length >= Math.max(3, indexedBlocks.length)\n    ? barcodeBlocks\n    : visualBlocks.length > indexedBlocks.length ? visualBlocks : indexedBlocks\n  const indexedItems = receiptBlocks.map(parseIndexedBlock)\n'''
if old_blocks not in smart:
    raise SystemExit('receiptBlocks selection not found')
smart = smart.replace(old_blocks, new_blocks, 1)

smart_path.write_text(smart, encoding='utf-8')
