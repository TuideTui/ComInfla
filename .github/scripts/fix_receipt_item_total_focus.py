from pathlib import Path
import re

path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

new_detector = r'''function detectDeclaredItemCount(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|¦]/g, 'I')
    .toUpperCase()
  const lines = normalized.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const compact = lines.join(' ')

  const parseCountToken = (raw: string | undefined) => {
    if (!raw) return null
    const digits = raw
      .toUpperCase()
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '')
    if (!digits) return null
    const value = Number(digits)
    return Number.isFinite(value) && value >= 1 && value <= 60 ? value : null
  }

  const isItemTotalLine = (line: string) => {
    const compactLine = line.replace(/\s+/g, '')
    return /QTD/.test(compactLine) && /TOTAL/.test(compactLine) && /(ITENS|1TENS|LTENS|TENS)/.test(compactLine)
  }

  const trailingCount = (line: string) => {
    const match = line.match(/([0-9OQIL]{1,4})\s*$/i)
    return parseCountToken(match?.[1])
  }

  // 1) NFC-e: o campo QTD. TOTAL DE ITENS costuma ficar imediatamente acima
  // de VALOR TOTAL. Essa relação espacial/textual é a fonte de maior confiança.
  for (let index = 0; index < lines.length; index++) {
    if (!/VALOR\W{0,5}TOTAL/.test(lines[index])) continue
    for (let offset = 1; offset <= 2; offset++) {
      const candidateIndex = index - offset
      if (candidateIndex < 0) continue
      const candidate = lines[candidateIndex]
      if (!/QTD/.test(candidate) || !/TOTAL/.test(candidate)) continue
      const direct = trailingCount(candidate)
      if (direct) return direct

      // Alguns OCRs quebram o valor 009 em uma linha isolada.
      if (candidateIndex + 1 < index) {
        const isolated = lines[candidateIndex + 1]
        if (/^[0-9OQIL\s]{1,6}$/i.test(isolated)) {
          const splitValue = parseCountToken(isolated)
          if (splitValue) return splitValue
        }
      }
    }
  }

  // 2) Procura direta pelo rótulo, tolerando pequenas deformações de ITENS.
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!isItemTotalLine(line) && !(/QTD/.test(line) && /TOTAL/.test(line))) continue
    const direct = trailingCount(line)
    if (direct) return direct
    const next = lines[index + 1]
    if (next && /^[0-9OQIL\s]{1,6}$/i.test(next)) {
      const splitValue = parseCountToken(next)
      if (splitValue) return splitValue
    }
  }

  const indexes = lines.map((line) => {
    const match = line.match(/^\s*0?(\d{1,2})\s+(?:\d[\dO]{7,13})\s+[A-ZÀ-Ý]/)
    return match ? Number(match[1]) : 0
  }).filter((value) => value > 0 && value <= 99)
  const unique = [...new Set(indexes)].sort((a, b) => a - b)
  const sequentialMax = unique.length >= 2 && unique[0] === 1
    ? unique.reduce((max, value) => value === max + 1 ? value : max, 0)
    : 0

  const patterns = [
    /QTD\W{0,4}TOTAL(?:\s+DE)?[^0-9]{0,20}([0OQIL]{0,2}\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0OQIL]*\d{1,3})\b/i,
    /TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0OQIL]*\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+(?:I|1|L)?TENS?\D{0,12}([0OQIL]*\d{1,3})\b/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const value = parseCountToken(match[1])
    if (!value) continue
    const observedMax = unique.length ? unique[unique.length - 1] : 0
    if (observedMax >= 3 && value < observedMax) return observedMax
    return value
  }

  if (sequentialMax >= 2) return sequentialMax
  return null
}

function detectLikelyProductRowCount'''

pattern = re.compile(r"function detectDeclaredItemCount\(text: string\) \{.*?\n\}\n\nfunction detectLikelyProductRowCount", re.S)
if not pattern.search(source):
    raise SystemExit('detectDeclaredItemCount block not found')
source = pattern.sub(lambda _match: new_detector, source, count=1)

helper = r'''
async function extractReceiptSummaryText(canvas: HTMLCanvasElement, worker: any) {
  // Segunda passada focada na área onde NFC-e normalmente imprime
  // QTD. TOTAL DE ITENS / VALOR TOTAL. O recorte reduz o ruído da página inteira.
  const sourceX = Math.round(canvas.width * 0.06)
  const sourceY = Math.round(canvas.height * 0.34)
  const sourceWidth = Math.round(canvas.width * 0.88)
  const sourceHeight = Math.round(canvas.height * 0.40)
  const scale = 2
  const crop = document.createElement('canvas')
  crop.width = Math.max(1, sourceWidth * scale)
  crop.height = Math.max(1, sourceHeight * scale)
  const context = crop.getContext('2d', { willReadFrequently: true })
  if (!context) return ''
  context.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height)

  const pixels = context.getImageData(0, 0, crop.width, crop.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = pixels.data[index] * .299 + pixels.data[index + 1] * .587 + pixels.data[index + 2] * .114
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.75 + 128))
    const value = boosted > 184 ? 255 : boosted < 104 ? 0 : boosted
    pixels.data[index] = value
    pixels.data[index + 1] = value
    pixels.data[index + 2] = value
  }
  context.putImageData(pixels, 0, 0)

  const result = await worker.recognize(crop)
  return String(result?.data?.text ?? '').trim()
}

'''
marker = 'async function extractPdfText(file: File, getWorker: () => Promise<any>) {'
if marker not in source:
    raise SystemExit('extractPdfText marker not found')
source = source.replace(marker, helper + marker, 1)

source = source.replace("      const texts: string[] = []\n", "      const texts: string[] = []\n      const countHints: string[] = []\n", 1)

old_image = '''          const canvas = await imageFileToCanvas(entry.file, aggressive)\n          const ocrWorker = await getWorker()\n          const result = await ocrWorker.recognize(canvas)\n          text = result?.data?.text ?? ''\n'''
new_image = '''          const canvas = await imageFileToCanvas(entry.file, aggressive)\n          const ocrWorker = await getWorker()\n          const result = await ocrWorker.recognize(canvas)\n          text = result?.data?.text ?? ''\n\n          const initialDeclared = detectDeclaredItemCount(text)\n          const initialVisual = detectLikelyProductRowCount(text)\n          const suspiciousCount = !initialDeclared || (initialVisual >= 2 && Math.abs(initialDeclared - initialVisual) >= 4)\n          if (suspiciousCount) {\n            setProgressText('Conferindo a quantidade total de itens da nota…')\n            const summaryText = await extractReceiptSummaryText(canvas, ocrWorker)\n            if (summaryText) countHints.push(summaryText)\n          }\n'''
if old_image not in source:
    raise SystemExit('image OCR block not found')
source = source.replace(old_image, new_image, 1)

old_count = '      const declaredItemCount = resolveDeclaredItemCount(texts, mappedItems.length)\n'
new_count = '      const declaredItemCount = resolveDeclaredItemCount([...countHints, ...texts], mappedItems.length)\n'
if old_count not in source:
    raise SystemExit('declared count call not found')
source = source.replace(old_count, new_count, 1)

path.write_text(source, encoding='utf-8')
