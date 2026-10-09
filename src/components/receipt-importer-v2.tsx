'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select'
import { mergeReceiptParts, normalizeForMatch, similarityScore, type ParsedReceipt, type ParsedReceiptItem } from '@/lib/receipt-parser'
import { parseReceiptTextSmart } from '@/lib/receipt-parser-smart'
import { checkReceiptFingerprint, registerImportedPurchase, type ImportedPurchasePayload } from '@/app/app/comprando/import-actions'

type ProductOption = {
  id: string
  name: string
  brand: string | null
  presentation?: string | null
  packaging?: string | null
  barcode?: string | null
  unit?: string | null
}

type EstablishmentOption = {
  id: string
  name: string
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  establishment_type?: string | null
}

type ImportStage = 'source' | 'files' | 'processing' | 'review' | 'success'
type ImportQuality = 'good' | 'partial' | 'weak'
type ImportFile = { key: string; file: File; previewUrl: string | null }
type ReviewItem = ParsedReceiptItem & { productId: string }
type ReviewDraft = Omit<ParsedReceipt, 'items'> & {
  fingerprint: string
  establishmentId: string
  isNewEstablishment: boolean | null
  declaredItemCount: number | null
  items: ReviewItem[]
}

const NEW_VALUE = '__new__'

function centsToInput(value: number) {
  return (Math.max(0, value) / 100).toFixed(2).replace('.', ',')
}

function inputToCents(value: string) {
  const raw = value.trim().replace(/\s/g, '')
  if (!raw) return 0
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0
}

function formatBRL(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function localDateTimeInput(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function dateInputToIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function detectDeclaredItemCount(text: string) {
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
    /QTD\W{0,4}TOTAL(?:\s+DE)?[^0-9]{0,20}([0O]{0,2}\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /TOTAL(?:\s+DE)?\s+ITENS?\D{0,12}([0O]*\d{1,3})\b/i,
    /QTD\W{0,3}TOTAL(?:\s+DE)?\s+(?:I|1|L)?TENS?\D{0,12}([0O]*\d{1,3})\b/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const value = Number(match[1].replace(/O/g, '0'))
    if (!Number.isFinite(value) || value <= 0 || value > 999) continue
    const observedMax = unique.length ? unique[unique.length - 1] : 0
    if (observedMax >= 3 && value < observedMax) return observedMax
    if (sequentialMax >= 3 && (value > Math.max(observedMax, sequentialMax) * 2 || value - Math.max(observedMax, sequentialMax) >= 10)) return Math.max(observedMax, sequentialMax)
    return value
  }

  if (sequentialMax >= 2) return sequentialMax
  return null
}

function productLabel(product: ProductOption) {
  return [product.brand, product.name, product.presentation].filter(Boolean).join(' · ')
}

function makeBlankItem(): ReviewItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rawName: '',
    name: '',
    barcode: null,
    presentation: null,
    quantity: 1,
    unit: 'unit',
    unitPriceCents: 0,
    totalCents: 0,
    discountCents: 0,
    notes: '',
    confidence: 'low',
    sourceLine: '',
    productId: NEW_VALUE,
  }
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function buildFingerprint(receipt: ParsedReceipt) {
  if (receipt.documentKey) return sha256(`nfce:${receipt.documentKey}`)
  const itemKey = receipt.items
    .map((item) => `${item.barcode || normalizeForMatch(item.name)}:${item.quantity.toFixed(3)}:${item.unitPriceCents}:${item.totalCents}`)
    .sort().join('|')
  return sha256(`${receipt.merchantCnpj}|${normalizeForMatch(receipt.merchantName)}|${receipt.purchasedAt.slice(0, 16)}|${receipt.totalCents}|${itemKey}`)
}

async function imageFileToCanvas(file: File, aggressive = false) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'))
      image.src = url
    })
    const maxSide = aggressive ? 2300 : 2000
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114
      const contrast = aggressive ? 1.55 : 1.3
      const adjusted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128))
      const finalValue = aggressive ? (adjusted > 176 ? 255 : adjusted < 92 ? 0 : adjusted) : adjusted
      pixels.data[i] = finalValue
      pixels.data[i + 1] = finalValue
      pixels.data[i + 2] = finalValue
    }
    context.putImageData(pixels, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function extractPdfText(file: File, getWorker: () => Promise<any>) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pageCount = Math.min(pdf.numPages, 10)
  let combined = ''
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const embedded = textContent.items.map((item: any) => String(item.str ?? '')).join(' ').trim()
    if (embedded.length > 70) combined += `\n${embedded}`
    else {
      const viewport = page.getViewport({ scale: 1.9 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (context) {
        await page.render({ canvasContext: context, viewport }).promise
        const worker = await getWorker()
        const result = await worker.recognize(canvas)
        combined += `\n${result.data.text ?? ''}`
      }
    }
  }
  return combined
}

function bestEstablishment(receipt: ParsedReceipt, establishments: EstablishmentOption[]) {
  if (!receipt.merchantName) return ''
  let best = { id: '', score: 0 }
  for (const establishment of establishments) {
    const score = similarityScore(receipt.merchantName, establishment.name)
    if (score > best.score) best = { id: establishment.id, score }
  }
  return best.score >= .58 ? best.id : ''
}

function bestProduct(item: ParsedReceiptItem, products: ProductOption[]) {
  if (item.barcode) {
    const exact = products.find((product) => product.barcode && product.barcode.replace(/\D/g, '') === item.barcode)
    if (exact) return exact.id
  }
  let best = { id: '', score: 0 }
  for (const product of products) {
    const score = similarityScore(`${item.name} ${item.presentation ?? ''}`, `${product.name} ${product.brand ?? ''} ${product.presentation ?? ''}`)
    if (score > best.score) best = { id: product.id, score }
  }
  return best.score >= .7 ? best.id : NEW_VALUE
}

function sourceLabel(kind: ParsedReceipt['sourceKind']) {
  if (kind === 'nfce') return 'NFC-e / nota fiscal'
  if (kind === 'delivery') return 'Delivery / pedido online'
  if (kind === 'receipt') return 'Comprovante'
  return 'Documento identificado'
}

function confidenceLabel(value: ParsedReceiptItem['confidence']) {
  if (value === 'high') return 'Alta confiança'
  if (value === 'medium') return 'Revisar'
  return 'Baixa confiança'
}

function isReviewItemComplete(item: ReviewItem) {
  const hasUsefulName = item.name.trim().length >= 2 && !/^Item \d+ da nota$/i.test(item.name.trim())
  if (!hasUsefulName || item.quantity <= 0 || item.unitPriceCents <= 0) return false
  if (item.totalCents > 0) {
    const calculated = Math.round(item.quantity * item.unitPriceCents)
    const tolerance = Math.max(3, Math.round(item.totalCents * .01))
    if (Math.abs(calculated - item.totalCents) > tolerance) return false
  }
  return true
}

function receiptItemIndex(item: ReviewItem) {
  const match = item.sourceLine?.trim().match(/^0?(\d{1,2})\b/)
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

function qualityCopy(quality: ImportQuality) {
  if (quality === 'good') return { label: 'Leitura boa', title: 'A maior parte da compra foi entendida', text: 'Confira os produtos e confirme antes de registrar.' }
  if (quality === 'partial') return { label: 'Leitura parcial', title: 'Encontramos dados, mas há pontos para revisar', text: 'Itens ou valores podem precisar de pequenos ajustes.' }
  return { label: 'Leitura fraca', title: 'Não conseguimos montar os itens automaticamente', text: 'O total ou outros dados podem ter sido lidos. Tente novamente ou adicione os itens manualmente.' }
}

export function ReceiptImporterV2({ products, establishments }: { products: ProductOption[]; establishments: EstablishmentOption[] }) {
  const router = useRouter()
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const filesRef = useRef<ImportFile[]>([])
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<ImportStage>('source')
  const [files, setFiles] = useState<ImportFile[]>([])
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('Preparando leitura…')
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [rawText, setRawText] = useState('')
  const [showRawText, setShowRawText] = useState(false)
  const [duplicatePurchaseId, setDuplicatePurchaseId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState<{ purchaseId: string | null; createdProducts: number; itemCount: number } | null>(null)

  const establishmentOptions = useMemo<SearchableOption[]>(() => establishments.map((item) => ({
    value: item.id,
    label: item.name,
    meta: [item.neighborhood, item.city].filter(Boolean).join(' · ') || undefined,
    searchText: `${item.name} ${item.neighborhood ?? ''} ${item.city ?? ''}`,
  })), [establishments])

  const productOptions = useMemo<SearchableOption[]>(() => [
    { value: NEW_VALUE, label: '+ Cadastrar como novo produto', meta: 'Criado somente ao registrar', searchText: 'novo cadastrar produto' },
    ...products.map((product) => ({ value: product.id, label: productLabel(product), meta: product.barcode ? `Código ${product.barcode}` : product.packaging || undefined, searchText: `${product.name} ${product.brand ?? ''} ${product.presentation ?? ''} ${product.barcode ?? ''}` })),
  ], [products])

  const itemNetCents = useMemo(() => draft?.items.reduce((sum, item) => sum + Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents), 0) ?? 0, [draft])
  const identifiedValueCents = useMemo(() => draft?.items.reduce((sum, item) => {
    if (!isReviewItemComplete(item)) return sum
    return sum + Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents)
  }, 0) ?? 0, [draft])
  const calculatedTotalCents = draft ? Math.max(0, itemNetCents + draft.extraFeesCents - draft.orderDiscountCents) : 0
  const differenceCents = draft?.totalCents ? calculatedTotalCents - draft.totalCents : 0
  const newProductsCount = draft?.items.filter((item) => item.productId === NEW_VALUE).length ?? 0
  const structuredItemCount = draft?.items.filter(isReviewItemComplete).length ?? 0
  const incompleteItemCount = Math.max(0, (draft?.items.length ?? 0) - structuredItemCount)
  const itemsReady = Boolean(draft?.items.length && draft.items.every(isReviewItemComplete))
  const establishmentReady = Boolean(draft && draft.isNewEstablishment === false && draft.establishmentId)
  const purchaseDataReady = Boolean(establishmentReady && draft?.purchasedAt && draft?.paymentMethod)

  const quality = useMemo<ImportQuality>(() => {
    if (!draft || draft.items.length === 0) return 'weak'
    const tolerance = draft.totalCents ? 5 : 0
    const totalMatches = !draft.totalCents || Math.abs(calculatedTotalCents - draft.totalCents) <= tolerance
    const countMatches = !draft.declaredItemCount || draft.declaredItemCount === structuredItemCount
    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length
    if (totalMatches && countMatches && incompleteItemCount === 0 && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'
    return 'partial'
  }, [draft, calculatedTotalCents, structuredItemCount, incompleteItemCount])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) confirmOpen ? setConfirmOpen(false) : closeImporter()
    }
    window.addEventListener('keydown', handler)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', handler) }
  }, [open, confirmOpen, isPending])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => () => {
    filesRef.current.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl) })
  }, [])

  function resetState() {
    filesRef.current.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl) })
    filesRef.current = []
    setFiles([]); setStage('source'); setProgress(0); setProgressText('Preparando leitura…'); setDraft(null); setRawText(''); setShowRawText(false); setDuplicatePurchaseId(null); setError(''); setConfirmOpen(false); setSuccess(null)
  }

  function closeImporter() {
    if (isPending) return
    setOpen(false)
    window.setTimeout(resetState, 180)
  }

  function addFiles(selectedFiles: File[] | FileList | null) {
    const selected = selectedFiles ? Array.from(selectedFiles) : []
    if (!selected.length) return

    setError('')
    const current = filesRef.current
    const seen = new Set(current.map((entry) => `${entry.file.name}:${entry.file.size}:${entry.file.lastModified}`))
    const additions: ImportFile[] = []
    let rejectionMessage = ''

    for (const file of selected) {
      if (current.length + additions.length >= 10) break
      const identity = `${file.name}:${file.size}:${file.lastModified}`
      if (seen.has(identity)) continue

      if (file.size > 15 * 1024 * 1024) {
        rejectionMessage = 'Cada arquivo pode ter no máximo 15 MB.'
        continue
      }

      const lowerName = file.name.toLowerCase()
      const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(lowerName)
      if (!isPdf && !isImage) {
        rejectionMessage = 'Use imagens JPG, PNG, WebP ou documentos PDF.'
        continue
      }

      additions.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
      })
      seen.add(identity)
    }

    if (!additions.length) {
      if (rejectionMessage) setError(rejectionMessage)
      return
    }

    const next = [...current, ...additions]
    filesRef.current = next
    setFiles(next)
    setStage('files')
    if (rejectionMessage) setError(rejectionMessage)
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files ? Array.from(event.currentTarget.files) : []
    event.currentTarget.value = ''
    addFiles(selected)
  }

  function removeFile(key: string) {
    const current = filesRef.current
    const target = current.find((entry) => entry.key === key)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    const next = current.filter((entry) => entry.key !== key)
    filesRef.current = next
    setFiles(next)
    if (!next.length) setStage('source')
  }

  async function processFiles(aggressive = false) {
    const filesToProcess = filesRef.current
    if (!filesToProcess.length) {
      setError('Adicione pelo menos uma foto ou PDF antes de iniciar a leitura.')
      setStage('source')
      return
    }
    setStage('processing'); setError(''); setProgress(0); setShowRawText(false)
    let worker: any = null
    const getWorker = async () => {
      if (worker) return worker
      setProgressText('Carregando leitor de texto…')
      const tesseract: any = await import('tesseract.js')
      try { worker = await tesseract.createWorker('por') } catch { worker = await tesseract.createWorker('eng') }
      return worker
    }

    try {
      const parts: ParsedReceipt[] = []
      const texts: string[] = []
      for (let index = 0; index < filesToProcess.length; index++) {
        const entry = filesToProcess[index]
        setProgress(Math.round(index / filesToProcess.length * 88))
        setProgressText(`${aggressive ? 'Relendo' : 'Lendo'} ${index + 1} de ${filesToProcess.length}: ${entry.file.name}`)
        const isPdf = entry.file.type === 'application/pdf' || entry.file.name.toLowerCase().endsWith('.pdf')
        let text = ''
        if (isPdf) text = await extractPdfText(entry.file, getWorker)
        else {
          const canvas = await imageFileToCanvas(entry.file, aggressive)
          const ocrWorker = await getWorker()
          const result = await ocrWorker.recognize(canvas)
          text = result?.data?.text ?? ''
        }
        texts.push(text)
        parts.push(parseReceiptTextSmart(text))
      }
      if (worker) await worker.terminate()
      setRawText(texts.join('\n\n──────── ARQUIVO ────────\n\n'))
      setProgress(94); setProgressText('Conferindo itens repetidos e procurando seu catálogo…')
      const parsed = mergeReceiptParts(parts)
      const fingerprint = await buildFingerprint(parsed)
      const declaredItemCount = detectDeclaredItemCount(texts.join('\n'))
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
      setDraft(review)
      const duplicate = await checkReceiptFingerprint(fingerprint)
      setDuplicatePurchaseId(duplicate.duplicate ? duplicate.purchaseId : null)
      setProgress(100); setProgressText('Leitura concluída.')
      window.setTimeout(() => setStage('review'), 220)
    } catch (processingError) {
      try { if (worker) await worker.terminate() } catch {}
      setError(`${processingError instanceof Error ? processingError.message : 'Não foi possível ler os arquivos.'} Tente uma foto mais reta e com boa iluminação.`)
      setStage('files')
    }
  }

  function updateDraft(patch: Partial<ReviewDraft>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  function updateItem(key: string, patch: Partial<ReviewItem>) {
    setDraft((current) => current ? { ...current, items: current.items.map((item) => {
      if (item.key !== key) return item
      const next = { ...item, ...patch }
      if ('quantity' in patch || 'unitPriceCents' in patch) next.totalCents = Math.max(0, Math.round(next.quantity * next.unitPriceCents))
      return next
    }) } : current)
  }
  function removeItem(key: string) { setDraft((current) => current ? { ...current, items: current.items.filter((item) => item.key !== key) } : current) }

  function requestRegistration() {
    if (!draft) return
    if (!draft.items.length) return setError('Adicione pelo menos um item antes de registrar.')
    if (draft.isNewEstablishment === null) return setError('Confirme se o local é novo ou já está cadastrado.')
    if (draft.isNewEstablishment) return setError('Cadastre o novo estabelecimento antes de continuar com esta importação.')
    if (!draft.establishmentId) return setError('Escolha o estabelecimento onde a compra foi realizada.')
    if (!draft.purchasedAt) return setError('Informe manualmente a data e o horário da compra.')
    if (!draft.paymentMethod) return setError('Informe a forma de pagamento da compra.')
    for (const item of draft.items) {
      if (item.productId === NEW_VALUE && !item.name.trim()) return setError('Preencha o nome de todos os produtos novos.')
      if (!isReviewItemComplete(item)) return setError('Revise os itens incompletos. Todos precisam de nome, quantidade e preço unitário antes do registro.')
    }
    if (duplicatePurchaseId) return setError('Este comprovante já parece ter sido registrado anteriormente.')
    setError(''); setConfirmOpen(true)
  }

  function confirmRegistration() {
    if (!draft) return
    setConfirmOpen(false)
    const payload: ImportedPurchasePayload = {
      fingerprint: draft.fingerprint,
      establishment_id: draft.establishmentId,
      purchased_at: draft.purchasedAt,
      payment_method: draft.paymentMethod,
      notes: 'Compra registrada por Importação inteligente do ComInfla.',
      source_kind: draft.sourceKind,
      source_document_key: draft.documentKey,
      merchant_name: draft.merchantName,
      merchant_cnpj: draft.merchantCnpj,
      extra_fees_cents: draft.extraFeesCents,
      order_discount_cents: draft.orderDiscountCents,
      receipt_total_cents: draft.totalCents || calculatedTotalCents,
      file_count: files.length,
      metadata: { imported: true, reading_quality: quality },
      extraction_metadata: { warnings_count: draft.warnings.length, reading_quality: quality },
      items: draft.items.map((item) => ({ product_id: item.productId === NEW_VALUE ? null : item.productId, name: item.name.trim(), presentation: item.presentation, unit: item.unit, barcode: null, quantity: item.quantity, unit_price_cents: item.unitPriceCents, discount_cents: item.discountCents, is_promotion: item.discountCents > 0, notes: item.notes || null })),
    }
    startTransition(async () => {
      const result = await registerImportedPurchase(payload)
      if (!result.ok) { setError(result.message); return }
      setSuccess({ purchaseId: result.purchaseId ?? null, createdProducts: result.createdProducts ?? 0, itemCount: result.itemCount ?? draft.items.length })
      setStage('success'); router.refresh()
    })
  }

  const qualityText = qualityCopy(quality)
  const modal = open && typeof document !== 'undefined' ? createPortal(
    <div className="receipt-import-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) closeImporter() }}>
      <section className="receipt-import-modal" role="dialog" aria-modal="true" aria-label="Importação inteligente de comprovante">
        <header className="receipt-import-header">
          <div><span className="page-kicker">IMPORTAÇÃO INTELIGENTE</span><h2>{stage === 'review' ? 'Revise antes de registrar' : stage === 'processing' ? 'Lendo sua compra' : stage === 'success' ? 'Compra pronta' : 'Transforme a notinha em uma compra'}</h2><p>{stage === 'review' ? 'Nada será cadastrado até você confirmar. Ajuste o que precisar.' : 'Fotos e PDFs viram dados revisáveis antes de qualquer cadastro.'}</p></div>
          <button className="receipt-import-close" type="button" aria-label="Fechar" onClick={closeImporter} disabled={isPending}>×</button>
        </header>
        <div className="receipt-import-stepper">{['Adicionar','Ler','Revisar','Registrar'].map((label,index) => { const current = stage === 'source' || stage === 'files' ? 0 : stage === 'processing' ? 1 : stage === 'review' ? 2 : 3; return <span className={index <= current ? 'active' : ''} key={label}><i>{index+1}</i>{label}</span> })}</div>
        <div className="receipt-import-content">
          {error ? <div className="receipt-import-error"><strong>Atenção</strong><span>{error}</span></div> : null}

          {stage === 'source' ? <div className="receipt-source-stage">
            <div className="receipt-source-intro"><div className="receipt-paper-illustration"><i/><i/><i/><b>R$</b></div><div><h3>Como você quer adicionar o comprovante?</h3><p>Use até 10 imagens da mesma compra ou um PDF. Trechos sobrepostos são deduplicados na revisão.</p></div></div>
            <div className="receipt-source-grid"><button className="receipt-source-card" type="button" onClick={() => uploadRef.current?.click()}><span className="receipt-source-icon">↥</span><strong>Enviar arquivos</strong><p>Fotos ou PDFs do dispositivo.</p><small>JPG · PNG · WebP · PDF</small></button><button className="receipt-source-card featured" type="button" onClick={() => cameraRef.current?.click()}><span className="receipt-source-icon">⌾</span><strong>Escanear com a câmera</strong><p>Fotografe a nota na hora.</p><small>Ideal no celular</small></button></div>
            <div className="receipt-privacy-note"><span>◈</span><div><strong>Privacidade por padrão</strong><p>A imagem é processada no navegador. Só os dados revisados são registrados.</p></div></div>
          </div> : null}

          {stage === 'files' ? <div className="receipt-files-stage"><div className="receipt-stage-heading"><div><h3>Arquivos da compra</h3><p>{files.length} de 10 adicionados.</p></div><button className="ghost-button" type="button" onClick={() => uploadRef.current?.click()}>+ Adicionar</button></div><div className="receipt-file-grid">{files.map((entry,index) => <article className="receipt-file-card" key={entry.key}>{entry.previewUrl ? <img src={entry.previewUrl} alt={`Prévia ${index+1}`}/> : <div className="receipt-pdf-preview"><span>PDF</span></div>}<div><strong>{index+1}. {entry.file.name}</strong><span>{(entry.file.size/1024/1024).toFixed(1).replace('.',',')} MB</span></div><button type="button" onClick={() => removeFile(entry.key)}>×</button></article>)}</div><div className="receipt-files-actions"><button className="ghost-button" type="button" onClick={() => cameraRef.current?.click()}>Abrir câmera</button><button className="button button-primary" type="button" onClick={() => processFiles(false)} disabled={!files.length}>Ler comprovantes →</button></div></div> : null}

          {stage === 'processing' ? <div className="receipt-processing-stage"><div className="receipt-scan-animation"><div className="receipt-scan-paper"><i/><i/><i/><i/><span/></div></div><span className="page-kicker">ANALISANDO LOCALMENTE</span><h3>{progressText}</h3><p>Identificando estabelecimento, data, itens, quantidades, preços e totais.</p><div className="receipt-progress"><span style={{width:`${progress}%`}}/></div><strong>{Math.round(progress)}%</strong></div> : null}

          {stage === 'review' && draft ? <div className="receipt-review-stage">
            {duplicatePurchaseId ? <div className="receipt-duplicate-warning"><strong>Possível duplicidade</strong><p>Este comprovante já foi usado em outra importação.</p></div> : null}

            <section className={`receipt-quality-card ${quality}`}>
              <div className="receipt-quality-head"><span className="receipt-quality-dot"/><div><span className="page-kicker">RESUMO DA LEITURA</span><h3>{quality === 'good' ? 'A leitura está consistente' : quality === 'partial' ? 'Encontramos dados, mas há diferenças para revisar' : 'A leitura precisa de revisão'}</h3><p>Compare o que a nota informa com o que o ComInfla conseguiu montar.</p></div><strong>{qualityText.label}</strong></div>
              <div className="receipt-quality-grid receipt-quality-grid-pairs">
                <span className={draft.declaredItemCount === structuredItemCount && incompleteItemCount === 0 ? 'ok' : 'warn'}>
                  <small>Itens encontrados</small>
                  <b>{draft.declaredItemCount ? `${structuredItemCount}/${draft.declaredItemCount} itens identificados` : `${structuredItemCount} ${structuredItemCount === 1 ? 'item identificado' : 'itens identificados'}`}</b>
                  <em>{draft.declaredItemCount ? (incompleteItemCount > 0 ? `${incompleteItemCount} ${incompleteItemCount === 1 ? 'linha da nota foi preservada e precisa' : 'linhas da nota foram preservadas e precisam'} de revisão.` : `A nota informa ${draft.declaredItemCount} itens no total.`) : 'A quantidade total da nota não pôde ser lida com segurança.'}</em>
                </span>
                <span className={!draft.totalCents || Math.abs(identifiedValueCents - draft.totalCents) <= 5 ? 'ok' : 'warn'}>
                  <small>Valor identificado</small>
                  <b>{draft.totalCents ? `${formatBRL(identifiedValueCents)} de ${formatBRL(draft.totalCents)}` : formatBRL(identifiedValueCents)}</b>
                  <em>{draft.totalCents ? `Total informado na nota: ${formatBRL(draft.totalCents)}.` : 'O total impresso na nota não pôde ser identificado.'}</em>
                </span>
              </div>
            </section>

            <section className="receipt-location-choice">
              <div className="receipt-location-choice-head"><span className="page-kicker">ESTABELECIMENTO</span><h3>Este é um local novo?</h3><p>O ComInfla não cria estabelecimentos automaticamente a partir da nota. Confirme como deseja continuar.</p></div>
              <div className="receipt-location-choice-actions">
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === false ? 'active' : ''}`} type="button" onClick={() => updateDraft({ isNewEstablishment: false })}><strong>Não, já está cadastrado</strong><span>Escolha um dos seus estabelecimentos.</span></button>
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === true ? 'active' : ''}`} type="button" onClick={() => updateDraft({ isNewEstablishment: true, establishmentId: '' })}><strong>Sim, é um local novo</strong><span>Cadastre primeiro na aba Cadastrando.</span></button>
              </div>
              {draft.isNewEstablishment === true ? <div className="receipt-location-new"><p>Vamos abrir o cadastro de estabelecimento já no formulário correto. Depois, volte para Comprando e faça a importação novamente.</p><button className="button button-primary" type="button" onClick={() => window.location.assign('/app/cadastrando?open=establishment')}>Cadastrar estabelecimento →</button></div> : null}
              {draft.isNewEstablishment === false ? <div className="field receipt-location-existing"><span>Estabelecimento *</span><SearchableSelect value={draft.establishmentId} onChange={(value) => updateDraft({ establishmentId: value })} options={establishmentOptions} placeholder="Escolha um estabelecimento" searchPlaceholder="Buscar estabelecimento…" emptyMessage="Nenhum estabelecimento cadastrado." ariaLabel="Estabelecimento"/></div> : null}
            </section>

            {draft.warnings.length ? <div className="receipt-review-warnings">{draft.warnings.map((warning) => <span key={warning}>! {warning}</span>)}</div> : null}

            {establishmentReady ? <section className="receipt-review-card receipt-purchase-data receipt-flow-unlocked"><div className="receipt-card-title"><div><span className="page-kicker">DADOS DA COMPRA</span><h3>{sourceLabel(draft.sourceKind)}</h3><p>Preencha os dois campos obrigatórios para liberar a revisão dos itens.</p></div><span className="receipt-flow-badge">ETAPA 2</span></div><div className="receipt-review-main-grid receipt-purchase-data-grid"><label className="field"><span>Data e horário *</span><input type="datetime-local" required value={localDateTimeInput(draft.purchasedAt)} onChange={(e)=>updateDraft({purchasedAt:e.target.value ? dateInputToIso(e.target.value) : ''})}/><small className="receipt-required-note">Confirme manualmente a data correta da compra.</small></label><label className="field"><span>Pagamento *</span><select required value={draft.paymentMethod} onChange={(e)=>updateDraft({paymentMethod:e.target.value})}><option value="">Selecione a forma de pagamento</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="benefit">VA / VR</option><option value="other">Outro</option></select><small className="receipt-required-note">Informe como esta compra foi paga.</small></label></div></section> : <section className="receipt-flow-lock"><span className="receipt-flow-lock-icon">2</span><div><span className="page-kicker">PRÓXIMA ETAPA</span><h3>Dados da compra bloqueados</h3><p>Primeiro confirme acima se o estabelecimento já está cadastrado e selecione o local correto.</p></div></section>}

            {purchaseDataReady ? <>
            <section className="receipt-review-card"><div className="receipt-stage-heading"><div><span className="page-kicker">ITENS IDENTIFICADOS</span><h3>{draft.items.length === 0 ? 'Nenhum item identificado' : incompleteItemCount > 0 ? `${structuredItemCount} identificados · ${incompleteItemCount} para completar` : `${draft.items.length} ${draft.items.length === 1 ? 'item para revisar' : 'itens para revisar'}`}</h3></div><button className="ghost-button" type="button" onClick={()=>updateDraft({items:[...draft.items,makeBlankItem()]})}>+ Adicionar item</button></div>
              {draft.items.length === 0 ? <div className="receipt-no-items"><div className="receipt-no-items-icon">?</div><div><strong>O ComInfla leu a nota, mas não conseguiu separar os produtos.</strong><p>Isso pode acontecer por reflexo, dobra no papel, fonte muito pequena ou espaços perdidos pelo OCR.</p><div className="receipt-no-items-actions"><button className="button button-primary" type="button" onClick={()=>processFiles(true)}>Tentar extrair itens novamente</button><button className="ghost-button" type="button" onClick={()=>updateDraft({items:[makeBlankItem()]})}>Adicionar manualmente</button><button className="ghost-button" type="button" onClick={()=>setShowRawText((v)=>!v)}>{showRawText ? 'Ocultar texto lido' : 'Ver texto lido da nota'}</button></div></div></div> : <div className="receipt-items-review">{draft.items.map((item,index)=><article className={`receipt-review-item ${isReviewItemComplete(item) ? '' : 'incomplete'}`} key={item.key}><div className="receipt-item-top"><span className="receipt-item-index">{String(index+1).padStart(2,'0')}</span><span className={`receipt-confidence ${item.confidence}`}>{confidenceLabel(item.confidence)}</span><button type="button" onClick={()=>removeItem(item.key)}>×</button></div><div className="receipt-item-product-row"><div className="field"><span>Produto no seu catálogo</span><SearchableSelect value={item.productId} onChange={(value)=>updateItem(item.key,{productId:value})} options={productOptions} placeholder="Vincular produto" searchPlaceholder="Buscar produto…" emptyMessage="Nenhum produto encontrado." ariaLabel={`Produto ${index+1}`}/></div><label className="field"><span>{item.productId===NEW_VALUE?'Nome do novo produto':'Nome lido na nota'}</span><input value={item.name} onChange={(e)=>updateItem(item.key,{name:e.target.value})}/></label></div>{item.productId===NEW_VALUE ? <div className="receipt-new-product-meta"><label className="field"><span>Apresentação</span><input value={item.presentation??''} onChange={(e)=>updateItem(item.key,{presentation:e.target.value||null})} placeholder="Ex.: 350 ml, 1 kg"/></label><label className="field"><span>Unidade</span><select value={item.unit} onChange={(e)=>updateItem(item.key,{unit:e.target.value as ReviewItem['unit']})}><option value="unit">Unidade</option><option value="kg">kg</option><option value="g">g</option><option value="l">L</option><option value="ml">ml</option></select></label></div>:null}<div className="receipt-item-values"><label className="field"><span>Quantidade</span><input inputMode="decimal" value={String(item.quantity).replace('.',',')} onChange={(e)=>updateItem(item.key,{quantity:Number(e.target.value.replace(',','.'))||0})}/></label><label className="field"><span>Preço unit.</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={centsToInput(item.unitPriceCents)} onChange={(e)=>updateItem(item.key,{unitPriceCents:inputToCents(e.target.value)})}/></div></label><label className="field"><span>Desconto do item</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={item.discountCents?centsToInput(item.discountCents):''} placeholder="0,00" onChange={(e)=>updateItem(item.key,{discountCents:inputToCents(e.target.value)})}/></div></label><div className="receipt-item-total"><span>Total</span><strong>{formatBRL(Math.max(0,Math.round(item.quantity*item.unitPriceCents)-item.discountCents))}</strong></div></div></article>)}</div>}
              {showRawText && rawText ? <div className="receipt-raw-text"><div><strong>Texto reconhecido pelo leitor</strong><button type="button" onClick={()=>setShowRawText(false)}>Fechar</button></div><pre>{rawText}</pre></div> : null}
              {draft.items.length > 0 ? <div className="receipt-retry-line"><button className="text-link" type="button" onClick={()=>processFiles(true)}>A leitura parece errada? Tentar novamente com contraste reforçado</button><button className="text-link" type="button" onClick={()=>setShowRawText((v)=>!v)}>Ver texto lido</button></div> : null}
            </section>

            <section className="receipt-review-card receipt-totals-card"><div><span className="page-kicker">CONFERÊNCIA</span><h3>Os valores batem?</h3><p>Taxas e descontos ficam separados dos produtos.</p></div><div className="receipt-total-edit-grid"><label className="field"><span>Taxas adicionais</span><div className="money-input"><b>R$</b><input value={draft.extraFeesCents?centsToInput(draft.extraFeesCents):''} placeholder="0,00" onChange={(e)=>updateDraft({extraFeesCents:inputToCents(e.target.value)})}/></div></label><label className="field"><span>Desconto do pedido</span><div className="money-input"><b>R$</b><input value={draft.orderDiscountCents?centsToInput(draft.orderDiscountCents):''} placeholder="0,00" onChange={(e)=>updateDraft({orderDiscountCents:inputToCents(e.target.value)})}/></div></label><label className="field"><span>Total impresso na nota</span><div className="money-input"><b>R$</b><input value={draft.totalCents?centsToInput(draft.totalCents):''} placeholder="0,00" onChange={(e)=>updateDraft({totalCents:inputToCents(e.target.value)})}/></div></label></div><div className="receipt-total-summary"><span><small>Itens</small><b>{formatBRL(itemNetCents)}</b></span><span><small>+ Taxas</small><b>{formatBRL(draft.extraFeesCents)}</b></span><span><small>− Desconto</small><b>{formatBRL(draft.orderDiscountCents)}</b></span><span className="strong"><small>Total calculado</small><b>{formatBRL(calculatedTotalCents)}</b></span></div>{draft.totalCents ? <div className={`receipt-total-check ${Math.abs(differenceCents)<=2?'ok':'warning'}`}><strong>{Math.abs(differenceCents)<=2?'✓ Valores conferem':'! Há uma diferença para revisar'}</strong><span>{Math.abs(differenceCents)<=2?`O total calculado coincide com ${formatBRL(draft.totalCents)}.`:`Diferença de ${formatBRL(Math.abs(differenceCents))}.`}</span></div>:null}</section>

            <div className="receipt-review-footer"><div><strong>{newProductsCount} {newProductsCount===1?'produto novo':'produtos novos'}</strong><span>{files.length} {files.length===1?'arquivo processado':'arquivos processados'} · {qualityText.label}</span></div><button className="button button-primary" type="button" onClick={requestRegistration} disabled={!itemsReady || Boolean(duplicatePurchaseId) || isPending || !purchaseDataReady}>Registrar compra</button></div>
            </> : <section className="receipt-flow-lock receipt-flow-lock-final"><span className="receipt-flow-lock-icon">3</span><div><span className="page-kicker">ITENS E CONFERÊNCIA</span><h3>Complete os dados da compra para continuar</h3><p>Depois de preencher Data e horário e Pagamento, os produtos identificados, os valores e o botão de registro serão liberados.</p></div></section>}
          </div> : null}

          {stage === 'success' && success ? <div className="receipt-success-stage"><div className="receipt-success-icon">✓</div><span className="page-kicker">IMPORTAÇÃO CONCLUÍDA</span><h3>Compra registrada</h3><p>{success.itemCount} {success.itemCount===1?'item foi salvo':'itens foram salvos'}.</p><button className="button button-primary" type="button" onClick={()=>success.purchaseId?window.location.assign(`/app/comprando?purchase=${success.purchaseId}`):closeImporter()}>Ver compra e insights →</button></div> : null}
        </div>

        <input ref={uploadRef} className="receipt-hidden-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" multiple onChange={handleFileSelection}/>
        <input ref={cameraRef} className="receipt-hidden-input" type="file" accept="image/*" capture="environment" onChange={handleFileSelection}/>
        {confirmOpen && draft ? <div className="receipt-confirm-overlay"><div className="receipt-confirm-card"><span className="page-kicker">CONFIRME O REGISTRO</span><h3>Registrar esta compra?</h3><div className="receipt-confirm-summary"><span><small>Estabelecimento</small><b>{establishments.find((item)=>item.id===draft.establishmentId)?.name || 'Não selecionado'}</b></span><span><small>Itens</small><b>{draft.items.length}</b></span><span><small>Total</small><b>{formatBRL(calculatedTotalCents)}</b></span><span><small>Qualidade</small><b>{qualityText.label}</b></span></div><p>Nada foi cadastrado até agora. Ao confirmar, a compra e os novos cadastros serão gravados juntos.</p><div className="receipt-confirm-actions"><button className="ghost-button" type="button" onClick={()=>setConfirmOpen(false)}>Voltar e revisar</button><button className="button button-primary" type="button" onClick={confirmRegistration} disabled={isPending}>{isPending?'Registrando…':'Confirmar e registrar'}</button></div></div></div>:null}
      </section>
    </div>, document.body) : null

  return <><button className="receipt-import-trigger" type="button" onClick={()=>{resetState();setOpen(true)}}><span className="receipt-import-trigger-icon"><i/><i/><b>⌁</b></span><span><small>COMEÇAR</small><strong>Abrir Importação inteligente</strong><em>Envie a notinha, confira a qualidade da leitura e revise antes de registrar.</em></span><b>→</b></button>{modal}</>
}
