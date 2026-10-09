'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select'
import {
  mergeReceiptParts,
  normalizeForMatch,
  parseReceiptText,
  similarityScore,
  type ParsedReceipt,
  type ParsedReceiptItem,
} from '@/lib/receipt-parser'
import {
  checkReceiptFingerprint,
  registerImportedPurchase,
  type ImportedPurchasePayload,
} from '@/app/app/comprando/import-actions'

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

type ImportFile = {
  key: string
  file: File
  previewUrl: string | null
}

type ReviewItem = ParsedReceiptItem & {
  productId: string
}

type ReviewDraft = ParsedReceipt & {
  fingerprint: string
  establishmentId: string
  newEstablishmentName: string
  newEstablishmentType: string
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
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
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
    .sort()
    .join('|')
  const dateKey = receipt.purchasedAt ? receipt.purchasedAt.slice(0, 16) : ''
  return sha256(`${receipt.merchantCnpj}|${normalizeForMatch(receipt.merchantName)}|${dateKey}|${receipt.totalCents}|${itemKey}`)
}

async function imageFileToCanvas(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'))
      image.src = url
    })
    const maxSide = 1900
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = pixels.data
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.28 + 128))
      data[i] = contrast
      data[i + 1] = contrast
      data[i + 2] = contrast
    }
    context.putImageData(pixels, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function extractPdfText(file: File, onProgress: (value: number, detail: string) => void, getWorker: () => Promise<any>) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pageCount = Math.min(pdf.numPages, 10)
  let combined = ''
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const embedded = textContent.items.map((item: any) => String(item.str ?? '')).join(' ').trim()
    if (embedded.length > 70) {
      combined += `\n${embedded}`
    } else {
      const viewport = page.getViewport({ scale: 1.8 })
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
    onProgress(pageNumber / pageCount, `Lendo página ${pageNumber} de ${pageCount}`)
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
  return best.score >= 0.58 ? best.id : ''
}

function bestProduct(item: ParsedReceiptItem, products: ProductOption[]) {
  if (item.barcode) {
    const barcode = products.find((product) => product.barcode && product.barcode.replace(/\D/g, '') === item.barcode)
    if (barcode) return barcode.id
  }
  let best = { id: '', score: 0 }
  const source = `${item.name} ${item.presentation ?? ''}`
  for (const product of products) {
    const score = similarityScore(source, `${product.name} ${product.brand ?? ''} ${product.presentation ?? ''}`)
    if (score > best.score) best = { id: product.id, score }
  }
  return best.score >= 0.7 ? best.id : NEW_VALUE
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

export function ReceiptImporter({ products, establishments }: { products: ProductOption[]; establishments: EstablishmentOption[] }) {
  const router = useRouter()
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<ImportStage>('source')
  const [files, setFiles] = useState<ImportFile[]>([])
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('Preparando leitura…')
  const [draft, setDraft] = useState<ReviewDraft | null>(null)
  const [duplicatePurchaseId, setDuplicatePurchaseId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState<{ purchaseId: string | null; createdProducts: number; itemCount: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        if (confirmOpen) setConfirmOpen(false)
        else closeImporter()
      }
    }
    window.addEventListener('keydown', keyHandler)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', keyHandler)
    }
  }, [open, confirmOpen, isPending])

  useEffect(() => () => {
    files.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl) })
  }, [files])

  const establishmentOptions = useMemo<SearchableOption[]>(() => [
    { value: NEW_VALUE, label: '+ Criar estabelecimento a partir da nota', meta: 'Será criado somente ao confirmar a compra', searchText: 'novo criar estabelecimento' },
    ...establishments.map((item) => ({
      value: item.id,
      label: item.name,
      meta: [item.neighborhood, item.city].filter(Boolean).join(' · ') || undefined,
      searchText: `${item.name} ${item.neighborhood ?? ''} ${item.city ?? ''}`,
    })),
  ], [establishments])

  const productOptions = useMemo<SearchableOption[]>(() => [
    { value: NEW_VALUE, label: '+ Cadastrar como novo produto', meta: 'Criado somente ao registrar', searchText: 'novo cadastrar produto' },
    ...products.map((product) => ({
      value: product.id,
      label: productLabel(product),
      meta: product.barcode ? `Código ${product.barcode}` : product.packaging || undefined,
      searchText: `${product.name} ${product.brand ?? ''} ${product.presentation ?? ''} ${product.barcode ?? ''}`,
    })),
  ], [products])

  const itemNetCents = useMemo(() => draft?.items.reduce((sum, item) => sum + Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents), 0) ?? 0, [draft])
  const calculatedTotalCents = draft ? Math.max(0, itemNetCents + draft.extraFeesCents - draft.orderDiscountCents) : 0
  const differenceCents = draft?.totalCents ? calculatedTotalCents - draft.totalCents : 0
  const newProductsCount = draft?.items.filter((item) => item.productId === NEW_VALUE).length ?? 0

  function resetState() {
    files.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl) })
    setFiles([])
    setStage('source')
    setProgress(0)
    setProgressText('Preparando leitura…')
    setDraft(null)
    setDuplicatePurchaseId(null)
    setError('')
    setConfirmOpen(false)
    setSuccess(null)
  }

  function closeImporter() {
    if (isPending) return
    setOpen(false)
    window.setTimeout(resetState, 180)
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return
    setError('')
    const currentNames = new Set(files.map((entry) => `${entry.file.name}:${entry.file.size}:${entry.file.lastModified}`))
    const next: ImportFile[] = []
    for (const file of Array.from(list)) {
      if (files.length + next.length >= 10) break
      const identity = `${file.name}:${file.size}:${file.lastModified}`
      if (currentNames.has(identity)) continue
      if (file.size > 15 * 1024 * 1024) {
        setError('Cada arquivo pode ter no máximo 15 MB.')
        continue
      }
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) {
        setError('Use imagens JPG, PNG, WebP ou documentos PDF.')
        continue
      }
      next.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
      })
      currentNames.add(identity)
    }
    setFiles((current) => [...current, ...next])
    if (next.length) setStage('files')
  }

  function removeFile(key: string) {
    setFiles((current) => {
      const target = current.find((entry) => entry.key === key)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      const next = current.filter((entry) => entry.key !== key)
      if (!next.length) setStage('source')
      return next
    })
  }

  async function processFiles() {
    if (!files.length) return
    setStage('processing')
    setError('')
    setProgress(0)
    let worker: any = null
    const getWorker = async () => {
      if (worker) return worker
      setProgressText('Carregando leitor de texto…')
      const tesseract: any = await import('tesseract.js')
      try {
        worker = await tesseract.createWorker('por', 1, {
          logger: (message: any) => {
            if (message?.status === 'recognizing text' && Number.isFinite(message.progress)) {
              setProgress((current) => Math.max(current, Math.min(94, current + message.progress * 3)))
            }
          },
        })
      } catch {
        worker = await tesseract.createWorker('eng')
      }
      return worker
    }

    try {
      const parts: ParsedReceipt[] = []
      for (let index = 0; index < files.length; index++) {
        const entry = files[index]
        const baseProgress = (index / files.length) * 90
        setProgress(Math.round(baseProgress))
        setProgressText(`Lendo ${index + 1} de ${files.length}: ${entry.file.name}`)
        let text = ''
        const isPdf = entry.file.type === 'application/pdf' || entry.file.name.toLowerCase().endsWith('.pdf')
        if (isPdf) {
          text = await extractPdfText(entry.file, (pageProgress, detail) => {
            setProgress(Math.round(baseProgress + pageProgress * (90 / files.length)))
            setProgressText(detail)
          }, getWorker)
        } else {
          const canvas = await imageFileToCanvas(entry.file)
          const ocrWorker = await getWorker()
          const result = await ocrWorker.recognize(canvas)
          text = result?.data?.text ?? ''
        }
        parts.push(parseReceiptText(text))
      }
      if (worker) await worker.terminate()
      setProgress(95)
      setProgressText('Conferindo itens repetidos e procurando seu catálogo…')

      const parsed = mergeReceiptParts(parts)
      const fingerprint = await buildFingerprint(parsed)
      const matchedEstablishment = bestEstablishment(parsed, establishments)
      const review: ReviewDraft = {
        ...parsed,
        fingerprint,
        establishmentId: matchedEstablishment || NEW_VALUE,
        newEstablishmentName: parsed.merchantName || '',
        newEstablishmentType: parsed.sourceKind === 'delivery' ? 'restaurant' : 'market',
        items: parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) })),
      }
      if (!review.items.length) review.items = [makeBlankItem()]
      setDraft(review)
      const duplicate = await checkReceiptFingerprint(fingerprint)
      setDuplicatePurchaseId(duplicate.duplicate ? duplicate.purchaseId : null)
      setProgress(100)
      setProgressText('Leitura concluída.')
      window.setTimeout(() => setStage('review'), 260)
    } catch (processingError) {
      try { if (worker) await worker.terminate() } catch {}
      const message = processingError instanceof Error ? processingError.message : 'Não foi possível ler os arquivos.'
      setError(`${message} Você pode tentar outra foto com mais luz e a nota inteira visível.`)
      setStage('files')
    }
  }

  function updateDraft(patch: Partial<ReviewDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
  }

  function updateItem(key: string, patch: Partial<ReviewItem>) {
    setDraft((current) => current ? {
      ...current,
      items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item),
    } : current)
  }

  function removeItem(key: string) {
    setDraft((current) => current ? { ...current, items: current.items.filter((item) => item.key !== key) } : current)
  }

  function validateReview() {
    if (!draft) return 'Nenhuma compra para revisar.'
    if (draft.establishmentId === NEW_VALUE && !draft.newEstablishmentName.trim()) return 'Informe o nome do estabelecimento.'
    if (!draft.items.length) return 'Adicione pelo menos um item.'
    for (const item of draft.items) {
      if (item.productId === NEW_VALUE && !item.name.trim()) return 'Preencha o nome de todos os produtos novos.'
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) return 'Revise as quantidades dos itens.'
      if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents < 0) return 'Revise os preços dos itens.'
    }
    if (duplicatePurchaseId) return 'Este comprovante já parece ter sido registrado anteriormente.'
    return ''
  }

  function requestRegistration() {
    const validation = validateReview()
    if (validation) { setError(validation); return }
    setError('')
    setConfirmOpen(true)
  }

  function confirmRegistration() {
    if (!draft) return
    setConfirmOpen(false)
    setError('')
    const payload: ImportedPurchasePayload = {
      fingerprint: draft.fingerprint,
      establishment_id: draft.establishmentId === NEW_VALUE ? null : draft.establishmentId,
      new_establishment: draft.establishmentId === NEW_VALUE ? {
        name: draft.newEstablishmentName.trim(),
        type: draft.newEstablishmentType,
      } : undefined,
      purchased_at: dateInputToIso(localDateTimeInput(draft.purchasedAt) || localDateTimeInput(new Date().toISOString())),
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
      metadata: { imported: true },
      extraction_metadata: {
        deduplicated_multi_image: files.length > 1,
        warnings_count: draft.warnings.length,
      },
      items: draft.items.map((item) => ({
        product_id: item.productId === NEW_VALUE ? null : item.productId,
        name: item.name.trim(),
        presentation: item.presentation,
        unit: item.unit,
        barcode: item.barcode,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        discount_cents: item.discountCents,
        is_promotion: item.discountCents > 0,
        notes: item.notes || null,
      })),
    }

    startTransition(async () => {
      const result = await registerImportedPurchase(payload)
      if (!result.ok) {
        if ('duplicate' in result && result.duplicate) setDuplicatePurchaseId(result.purchaseId ?? null)
        setError(result.message)
        return
      }
      setSuccess({
        purchaseId: result.purchaseId ?? null,
        createdProducts: result.createdProducts ?? 0,
        itemCount: result.itemCount ?? draft.items.length,
      })
      setStage('success')
      router.refresh()
    })
  }

  function finishSuccess() {
    const purchaseId = success?.purchaseId
    if (purchaseId) window.location.assign(`/app/comprando?purchase=${purchaseId}&message=${encodeURIComponent('Compra importada com sucesso. Confira os insights identificados.')}`)
    else closeImporter()
  }

  if (typeof document === 'undefined') {
    return <button className="receipt-import-trigger" type="button">Importação inteligente</button>
  }

  const modal = open ? createPortal(
    <div className="receipt-import-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) closeImporter() }}>
      <section className="receipt-import-modal" role="dialog" aria-modal="true" aria-label="Importação inteligente de comprovante">
        <header className="receipt-import-header">
          <div>
            <span className="page-kicker">IMPORTAÇÃO INTELIGENTE</span>
            <h2>{stage === 'review' ? 'Revise antes de registrar' : stage === 'processing' ? 'Lendo sua compra' : stage === 'success' ? 'Compra pronta' : 'Transforme a notinha em uma compra'}</h2>
            <p>{stage === 'review' ? 'Nada será cadastrado até você confirmar. Ajuste o que precisar.' : 'Fotos e PDFs viram itens editáveis sem você digitar a compra inteira.'}</p>
          </div>
          <button className="receipt-import-close" type="button" aria-label="Fechar" onClick={closeImporter} disabled={isPending}>×</button>
        </header>

        <div className="receipt-import-stepper" aria-label="Etapas da importação">
          {['Adicionar', 'Ler', 'Revisar', 'Registrar'].map((label, index) => {
            const stageIndex = stage === 'source' || stage === 'files' ? 0 : stage === 'processing' ? 1 : stage === 'review' ? 2 : 3
            return <span className={index <= stageIndex ? 'active' : ''} key={label}><i>{index + 1}</i>{label}</span>
          })}
        </div>

        <div className="receipt-import-content">
          {error ? <div className="receipt-import-error"><strong>Atenção</strong><span>{error}</span></div> : null}

          {stage === 'source' ? (
            <div className="receipt-source-stage">
              <div className="receipt-source-intro">
                <div className="receipt-paper-illustration" aria-hidden="true"><i /><i /><i /><b>R$</b></div>
                <div><h3>Como você quer adicionar o comprovante?</h3><p>Você pode usar até 10 imagens da mesma compra. O ComInfla remove linhas repetidas quando as fotos se sobrepõem.</p></div>
              </div>
              <div className="receipt-source-grid">
                <button className="receipt-source-card" type="button" onClick={() => uploadRef.current?.click()}>
                  <span className="receipt-source-icon">↥</span><strong>Enviar arquivos</strong><p>Escolha fotos ou PDFs que já estão no dispositivo.</p><small>JPG · PNG · WebP · PDF</small>
                </button>
                <button className="receipt-source-card featured" type="button" onClick={() => cameraRef.current?.click()}>
                  <span className="receipt-source-icon">⌾</span><strong>Escanear com a câmera</strong><p>Abra a câmera e fotografe a nota na hora.</p><small>Ideal no celular</small>
                </button>
              </div>
              <div className="receipt-privacy-note"><span>◈</span><div><strong>Privacidade por padrão</strong><p>As imagens são processadas no seu navegador. O ComInfla salva somente os dados que você revisar e confirmar.</p></div></div>
            </div>
          ) : null}

          {stage === 'files' ? (
            <div className="receipt-files-stage">
              <div className="receipt-stage-heading"><div><h3>Arquivos da compra</h3><p>{files.length} de 10 adicionados. Para notas compridas, fotografe trechos com alguma sobreposição.</p></div><button className="ghost-button" type="button" onClick={() => uploadRef.current?.click()} disabled={files.length >= 10}>+ Adicionar</button></div>
              <div className="receipt-file-grid">
                {files.map((entry, index) => (
                  <article className="receipt-file-card" key={entry.key}>
                    {entry.previewUrl ? <img src={entry.previewUrl} alt={`Prévia ${index + 1}`} /> : <div className="receipt-pdf-preview"><span>PDF</span></div>}
                    <div><strong>{index + 1}. {entry.file.name}</strong><span>{(entry.file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB</span></div>
                    <button type="button" aria-label="Remover arquivo" onClick={() => removeFile(entry.key)}>×</button>
                  </article>
                ))}
              </div>
              <div className="receipt-files-actions"><button className="ghost-button" type="button" onClick={() => cameraRef.current?.click()} disabled={files.length >= 10}>Abrir câmera</button><button className="button button-primary" type="button" onClick={processFiles}>Ler comprovantes →</button></div>
            </div>
          ) : null}

          {stage === 'processing' ? (
            <div className="receipt-processing-stage">
              <div className="receipt-scan-animation" aria-hidden="true"><div className="receipt-scan-paper"><i /><i /><i /><i /><span /></div></div>
              <span className="page-kicker">ANALISANDO LOCALMENTE</span>
              <h3>{progressText}</h3>
              <p>Identificando estabelecimento, data, itens, quantidades, preços, descontos e totais.</p>
              <div className="receipt-progress"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
              <strong>{Math.round(progress)}%</strong>
              <div className="receipt-processing-steps"><span className={progress > 12 ? 'done' : ''}>Texto</span><span className={progress > 45 ? 'done' : ''}>Itens</span><span className={progress > 75 ? 'done' : ''}>Catálogo</span><span className={progress >= 100 ? 'done' : ''}>Conferência</span></div>
            </div>
          ) : null}

          {stage === 'review' && draft ? (
            <div className="receipt-review-stage">
              {duplicatePurchaseId ? <div className="receipt-duplicate-warning"><strong>Possível duplicidade</strong><p>Este comprovante já foi usado em outra importação. O registro está bloqueado para evitar uma compra duplicada.</p></div> : null}
              {draft.warnings.length ? <div className="receipt-review-warnings">{draft.warnings.map((warning) => <span key={warning}>! {warning}</span>)}</div> : null}

              <section className="receipt-review-card receipt-purchase-data">
                <div className="receipt-card-title"><div><span className="page-kicker">DADOS DA COMPRA</span><h3>{sourceLabel(draft.sourceKind)}</h3></div>{draft.merchantCnpj ? <small>CNPJ {draft.merchantCnpj}</small> : null}</div>
                <div className="receipt-review-main-grid">
                  <div className="field receipt-establishment-field"><span>Estabelecimento</span><SearchableSelect value={draft.establishmentId} onChange={(value) => updateDraft({ establishmentId: value })} options={establishmentOptions} placeholder="Escolha o estabelecimento" searchPlaceholder="Buscar estabelecimento…" emptyMessage="Nenhum estabelecimento encontrado." ariaLabel="Estabelecimento da compra importada" /></div>
                  <label className="field"><span>Data e horário</span><input type="datetime-local" value={localDateTimeInput(draft.purchasedAt) || localDateTimeInput(new Date().toISOString())} onChange={(event) => updateDraft({ purchasedAt: dateInputToIso(event.target.value) })} /></label>
                  <label className="field"><span>Pagamento</span><select value={draft.paymentMethod} onChange={(event) => updateDraft({ paymentMethod: event.target.value })}><option value="">Não identificado</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="benefit">VA / VR</option><option value="other">Outro</option></select></label>
                </div>
                {draft.establishmentId === NEW_VALUE ? <div className="receipt-new-establishment"><label className="field"><span>Nome do novo estabelecimento</span><input value={draft.newEstablishmentName} onChange={(event) => updateDraft({ newEstablishmentName: event.target.value })} placeholder="Nome identificado na nota" /></label><label className="field"><span>Tipo</span><select value={draft.newEstablishmentType} onChange={(event) => updateDraft({ newEstablishmentType: event.target.value })}><option value="market">Mercado / supermercado</option><option value="restaurant">Restaurante / delivery</option><option value="pharmacy">Farmácia</option><option value="other">Outro</option></select></label></div> : null}
              </section>

              <section className="receipt-review-card">
                <div className="receipt-stage-heading"><div><span className="page-kicker">ITENS IDENTIFICADOS</span><h3>{draft.items.length} {draft.items.length === 1 ? 'item para revisar' : 'itens para revisar'}</h3></div><button className="ghost-button" type="button" onClick={() => updateDraft({ items: [...draft.items, makeBlankItem()] })}>+ Adicionar item</button></div>
                <div className="receipt-items-review">
                  {draft.items.map((item, index) => (
                    <article className="receipt-review-item" key={item.key}>
                      <div className="receipt-item-top"><span className="receipt-item-index">{String(index + 1).padStart(2, '0')}</span><span className={`receipt-confidence ${item.confidence}`}>{confidenceLabel(item.confidence)}</span><button type="button" aria-label="Remover item" onClick={() => removeItem(item.key)} disabled={draft.items.length === 1}>×</button></div>
                      <div className="receipt-item-product-row">
                        <div className="field"><span>Produto no seu catálogo</span><SearchableSelect value={item.productId} onChange={(value) => updateItem(item.key, { productId: value })} options={productOptions} placeholder="Vincular produto" searchPlaceholder="Buscar produto ou cadastrar novo…" emptyMessage="Nenhum produto encontrado." ariaLabel={`Produto do item ${index + 1}`} /></div>
                        <label className="field"><span>{item.productId === NEW_VALUE ? 'Nome do novo produto' : 'Nome lido na nota'}</span><input value={item.name} onChange={(event) => updateItem(item.key, { name: event.target.value })} /></label>
                      </div>
                      {item.productId === NEW_VALUE ? <div className="receipt-new-product-meta"><label className="field"><span>Apresentação</span><input value={item.presentation ?? ''} onChange={(event) => updateItem(item.key, { presentation: event.target.value || null })} placeholder="Ex.: 350 ml, 1 kg" /></label><label className="field"><span>Unidade</span><select value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value as ReviewItem['unit'] })}><option value="unit">Unidade</option><option value="kg">kg</option><option value="g">g</option><option value="l">L</option><option value="ml">ml</option></select></label>{item.barcode ? <label className="field"><span>Código de barras</span><input value={item.barcode} onChange={(event) => updateItem(item.key, { barcode: event.target.value.replace(/\D/g, '') || null })} /></label> : null}</div> : null}
                      <div className="receipt-item-values">
                        <label className="field"><span>Quantidade</span><input inputMode="decimal" value={String(item.quantity).replace('.', ',')} onChange={(event) => updateItem(item.key, { quantity: Number(event.target.value.replace(',', '.')) || 0 })} /></label>
                        <label className="field"><span>Preço unit.</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={centsToInput(item.unitPriceCents)} onChange={(event) => updateItem(item.key, { unitPriceCents: inputToCents(event.target.value) })} /></div></label>
                        <label className="field"><span>Desconto do item</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={item.discountCents ? centsToInput(item.discountCents) : ''} placeholder="0,00" onChange={(event) => updateItem(item.key, { discountCents: inputToCents(event.target.value) })} /></div></label>
                        <div className="receipt-item-total"><span>Total</span><strong>{formatBRL(Math.max(0, Math.round(item.quantity * item.unitPriceCents) - item.discountCents))}</strong></div>
                      </div>
                      {item.notes ? <label className="field receipt-item-notes"><span>Detalhes identificados</span><input value={item.notes} onChange={(event) => updateItem(item.key, { notes: event.target.value })} /></label> : null}
                    </article>
                  ))}
                </div>
              </section>

              <section className="receipt-review-card receipt-totals-card">
                <div><span className="page-kicker">CONFERÊNCIA</span><h3>Os valores batem?</h3><p>Taxas de entrega/serviço ficam separadas dos produtos para não distorcer o histórico de preços.</p></div>
                <div className="receipt-total-edit-grid"><label className="field"><span>Taxas adicionais</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={draft.extraFeesCents ? centsToInput(draft.extraFeesCents) : ''} placeholder="0,00" onChange={(event) => updateDraft({ extraFeesCents: inputToCents(event.target.value) })} /></div></label><label className="field"><span>Desconto do pedido</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={draft.orderDiscountCents ? centsToInput(draft.orderDiscountCents) : ''} placeholder="0,00" onChange={(event) => updateDraft({ orderDiscountCents: inputToCents(event.target.value) })} /></div></label><label className="field"><span>Total impresso na nota</span><div className="money-input"><b>R$</b><input inputMode="decimal" value={draft.totalCents ? centsToInput(draft.totalCents) : ''} placeholder="0,00" onChange={(event) => updateDraft({ totalCents: inputToCents(event.target.value) })} /></div></label></div>
                <div className="receipt-total-summary"><span><small>Itens após descontos</small><b>{formatBRL(itemNetCents)}</b></span><span><small>+ Taxas</small><b>{formatBRL(draft.extraFeesCents)}</b></span><span><small>− Desconto do pedido</small><b>{formatBRL(draft.orderDiscountCents)}</b></span><span className="strong"><small>Total calculado</small><b>{formatBRL(calculatedTotalCents)}</b></span></div>
                {draft.totalCents ? <div className={`receipt-total-check ${Math.abs(differenceCents) <= 2 ? 'ok' : 'warning'}`}><strong>{Math.abs(differenceCents) <= 2 ? '✓ Valores conferem' : '! Há uma diferença para revisar'}</strong><span>{Math.abs(differenceCents) <= 2 ? `O total calculado coincide com ${formatBRL(draft.totalCents)}.` : `Diferença de ${formatBRL(Math.abs(differenceCents))} entre os itens e o total informado na nota.`}</span></div> : null}
              </section>

              <div className="receipt-review-footer"><div><strong>{newProductsCount} {newProductsCount === 1 ? 'produto novo' : 'produtos novos'}</strong><span>{draft.establishmentId === NEW_VALUE ? '1 novo estabelecimento · ' : ''}{files.length} {files.length === 1 ? 'arquivo processado' : 'arquivos processados'}</span></div><button className="button button-primary" type="button" onClick={requestRegistration} disabled={Boolean(duplicatePurchaseId) || isPending}>Registrar compra</button></div>
            </div>
          ) : null}

          {stage === 'success' && success ? (
            <div className="receipt-success-stage"><div className="receipt-success-icon">✓</div><span className="page-kicker">IMPORTAÇÃO CONCLUÍDA</span><h3>Compra registrada</h3><p>{success.itemCount} {success.itemCount === 1 ? 'item foi salvo' : 'itens foram salvos'} e {success.createdProducts} {success.createdProducts === 1 ? 'produto novo foi criado' : 'produtos novos foram criados'} no seu catálogo.</p><button className="button button-primary" type="button" onClick={finishSuccess}>Ver compra e insights →</button></div>
          ) : null}
        </div>

        <input ref={uploadRef} className="receipt-hidden-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = '' }} />
        <input ref={cameraRef} className="receipt-hidden-input" type="file" accept="image/*" capture="environment" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = '' }} />

        {confirmOpen && draft ? <div className="receipt-confirm-overlay"><div className="receipt-confirm-card"><span className="page-kicker">CONFIRME O REGISTRO</span><h3>Registrar esta compra?</h3><div className="receipt-confirm-summary"><span><small>Estabelecimento</small><b>{draft.establishmentId === NEW_VALUE ? draft.newEstablishmentName : establishments.find((item) => item.id === draft.establishmentId)?.name}</b></span><span><small>Itens</small><b>{draft.items.length}</b></span><span><small>Total</small><b>{formatBRL(calculatedTotalCents)}</b></span><span><small>Novos produtos</small><b>{newProductsCount}</b></span></div>{Math.abs(differenceCents) > 2 && draft.totalCents ? <p className="receipt-confirm-warning">O total calculado ainda difere da nota em {formatBRL(Math.abs(differenceCents))}. Você pode registrar mesmo assim se já conferiu os valores.</p> : null}<p>Neste momento os novos cadastros e a compra serão gravados. A operação é feita de forma transacional.</p><div className="receipt-confirm-actions"><button className="ghost-button" type="button" onClick={() => setConfirmOpen(false)} disabled={isPending}>Voltar e revisar</button><button className="button button-primary" type="button" onClick={confirmRegistration} disabled={isPending}>{isPending ? 'Registrando…' : 'Confirmar e registrar'}</button></div></div></div> : null}
      </section>
    </div>, document.body) : null

  return (
    <>
      <button className="receipt-import-trigger" type="button" onClick={() => { resetState(); setOpen(true) }}>
        <span className="receipt-import-trigger-icon" aria-hidden="true"><i /><i /><b>⌁</b></span>
        <span><small>NOVO</small><strong>Importação inteligente</strong><em>Fotografe ou envie a notinha e revise os itens antes de registrar.</em></span>
        <b>→</b>
      </button>
      {modal}
    </>
  )
}
