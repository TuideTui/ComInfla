'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const MEDIA_BUCKET = 'cominfla-media'

function message(value: string) {
  return encodeURIComponent(value)
}

function parseMoneyToCents(value: unknown) {
  if (typeof value === 'number') return Math.round(value * 100)
  const raw = String(value ?? '').trim().replace(/\s/g, '')
  if (!raw) return 0
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0
}

function parseCoordinate(value: FormDataEntryValue | null, min: number, max: number) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function validMediaPath(value: FormDataEntryValue | null, userId: string, folder: 'products' | 'establishments') {
  const path = String(value ?? '').trim()
  if (!path) return null
  return path.startsWith(`${userId}/${folder}/`) ? path : null
}

async function authenticatedClient() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')
  return { supabase, userId }
}

async function removeOldMedia(supabase: any, previousPath?: string | null, nextPath?: string | null) {
  if (previousPath && previousPath !== nextPath) {
    await supabase.storage.from(MEDIA_BUCKET).remove([previousPath])
  }
}

function revalidateConsumptionPages() {
  revalidatePath('/app')
  revalidatePath('/app/comprando')
  revalidatePath('/app/analises')
  revalidatePath('/app/fechamento')
  revalidatePath('/app/mapa')
}

export async function createProduct(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const name = String(formData.get('name') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const subcategory = String(formData.get('subcategory') ?? '').trim()
  const presentation = String(formData.get('presentation') ?? '').trim()
  const packaging = String(formData.get('packaging') ?? '').trim()
  const barcode = String(formData.get('barcode') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const photoPath = validMediaPath(formData.get('photo_path'), userId, 'products')

  if (!name) redirect(`/app/comprando?error=${message('Informe o nome do produto.')}`)

  const { data: similar } = await supabase
    .from('products')
    .select('id,name,brand,presentation')
    .ilike('name', name)
    .is('archived_at', null)
    .limit(8)

  const duplicate = similar?.find((item) =>
    (item.brand ?? '').trim().toLowerCase() === brand.toLowerCase()
    && (item.presentation ?? '').trim().toLowerCase() === presentation.toLowerCase()
  )
  if (duplicate) {
    redirect(`/app/comprando?error=${message(`Já existe um produto muito parecido: ${duplicate.name}. Edite ou use o cadastro existente.`)}`)
  }

  const { error } = await supabase.from('products').insert({
    name,
    brand: brand || null,
    category_id: categoryId || null,
    subcategory: subcategory || null,
    presentation: presentation || null,
    base_quantity: 1,
    unit: 'unit',
    packaging: packaging || null,
    barcode: barcode || null,
    notes: notes || null,
    photo_path: photoPath,
  })

  if (error) redirect(`/app/comprando?error=${message('Não foi possível cadastrar o produto.')}`)
  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message('Produto cadastrado. A quantidade comprada será informada somente no registro da compra.')}`)
}

export async function updateProduct(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const productId = String(formData.get('product_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!productId || !name) redirect(`/app/comprando?error=${message('Produto inválido.')}`)

  const { data: current } = await supabase.from('products').select('id,photo_path').eq('id', productId).single()
  if (!current) redirect(`/app/comprando?error=${message('Produto não encontrado.')}`)

  const brand = String(formData.get('brand') ?? '').trim()
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const subcategory = String(formData.get('subcategory') ?? '').trim()
  const presentation = String(formData.get('presentation') ?? '').trim()
  const packaging = String(formData.get('packaging') ?? '').trim()
  const barcode = String(formData.get('barcode') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const photoPath = validMediaPath(formData.get('photo_path'), userId, 'products')

  const { error } = await supabase.from('products').update({
    name,
    brand: brand || null,
    category_id: categoryId || null,
    subcategory: subcategory || null,
    presentation: presentation || null,
    base_quantity: 1,
    unit: 'unit',
    packaging: packaging || null,
    barcode: barcode || null,
    notes: notes || null,
    photo_path: photoPath,
    updated_at: new Date().toISOString(),
  }).eq('id', productId)

  if (error) redirect(`/app/comprando/produto/${productId}/editar?error=${message('Não foi possível atualizar o produto.')}`)
  await removeOldMedia(supabase, current.photo_path, photoPath)
  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message('Produto atualizado. O histórico de compras foi preservado.')}`)
}

export async function deleteOrArchiveProduct(formData: FormData) {
  const { supabase } = await authenticatedClient()
  const productId = String(formData.get('product_id') ?? '').trim()
  if (!productId) redirect('/app/comprando')

  const [{ data: current }, { count: purchaseCount }, { count: basketCount }] = await Promise.all([
    supabase.from('products').select('id,name,photo_path').eq('id', productId).single(),
    supabase.from('purchase_items').select('*', { head: true, count: 'exact' }).eq('product_id', productId),
    supabase.from('basket_items').select('*', { head: true, count: 'exact' }).eq('product_id', productId),
  ])

  if (!current) redirect(`/app/comprando?error=${message('Produto não encontrado.')}`)

  if ((purchaseCount ?? 0) > 0 || (basketCount ?? 0) > 0) {
    const { error } = await supabase.from('products').update({ archived_at: new Date().toISOString() }).eq('id', productId)
    if (error) redirect(`/app/comprando?error=${message('Não foi possível arquivar o produto.')}`)
    revalidateConsumptionPages()
    redirect(`/app/comprando?message=${message('Produto arquivado. Como ele possui histórico, as compras antigas foram preservadas.')}`)
  }

  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) redirect(`/app/comprando?error=${message('Não foi possível excluir o produto.')}`)
  if (current.photo_path) await supabase.storage.from(MEDIA_BUCKET).remove([current.photo_path])
  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message('Produto excluído.')}`)
}

export async function createEstablishment(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const name = String(formData.get('name') ?? '').trim()
  const establishmentType = String(formData.get('establishment_type') ?? 'other')
  const visitFrequency = String(formData.get('visit_frequency') ?? 'occasional')
  const addressLine = String(formData.get('address_line') ?? '').trim()
  const neighborhood = String(formData.get('neighborhood') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim().toUpperCase().slice(0, 2)
  const notes = String(formData.get('notes') ?? '').trim()
  const latitude = parseCoordinate(formData.get('latitude'), -90, 90)
  const longitude = parseCoordinate(formData.get('longitude'), -180, 180)
  const photoPath = validMediaPath(formData.get('photo_path'), userId, 'establishments')

  if (!name) redirect(`/app/comprando?error=${message('Informe o nome do estabelecimento.')}`)

  const { data: existing } = await supabase
    .from('establishments')
    .select('id,name,neighborhood')
    .ilike('name', name)
    .is('archived_at', null)
    .limit(3)

  if (existing?.some((item) => (item.neighborhood ?? '').toLowerCase() === neighborhood.toLowerCase())) {
    redirect(`/app/comprando?error=${message('Já existe um estabelecimento com esse nome e bairro.')}`)
  }

  const { error } = await supabase.from('establishments').insert({
    name,
    establishment_type: establishmentType,
    visit_frequency: visitFrequency,
    address_line: addressLine || null,
    neighborhood: neighborhood || null,
    city: city || null,
    state: state || null,
    latitude,
    longitude,
    notes: notes || null,
    photo_path: photoPath,
  })

  if (error) redirect(`/app/comprando?error=${message('Não foi possível cadastrar o estabelecimento.')}`)
  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message(latitude != null && longitude != null ? 'Estabelecimento cadastrado e adicionado ao mapa.' : 'Estabelecimento cadastrado. Você pode adicionar a localização depois ao editar o local.')}`)
}

export async function updateEstablishment(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const establishmentId = String(formData.get('establishment_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!establishmentId || !name) redirect(`/app/comprando?error=${message('Estabelecimento inválido.')}`)

  const { data: current } = await supabase.from('establishments').select('id,photo_path').eq('id', establishmentId).single()
  if (!current) redirect(`/app/comprando?error=${message('Estabelecimento não encontrado.')}`)

  const establishmentType = String(formData.get('establishment_type') ?? 'other')
  const visitFrequency = String(formData.get('visit_frequency') ?? 'occasional')
  const addressLine = String(formData.get('address_line') ?? '').trim()
  const neighborhood = String(formData.get('neighborhood') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim().toUpperCase().slice(0, 2)
  const notes = String(formData.get('notes') ?? '').trim()
  const latitude = parseCoordinate(formData.get('latitude'), -90, 90)
  const longitude = parseCoordinate(formData.get('longitude'), -180, 180)
  const photoPath = validMediaPath(formData.get('photo_path'), userId, 'establishments')

  const { error } = await supabase.from('establishments').update({
    name,
    establishment_type: establishmentType,
    visit_frequency: visitFrequency,
    address_line: addressLine || null,
    neighborhood: neighborhood || null,
    city: city || null,
    state: state || null,
    latitude,
    longitude,
    notes: notes || null,
    photo_path: photoPath,
    updated_at: new Date().toISOString(),
  }).eq('id', establishmentId)

  if (error) redirect(`/app/comprando/estabelecimento/${establishmentId}/editar?error=${message('Não foi possível atualizar o estabelecimento.')}`)
  await removeOldMedia(supabase, current.photo_path, photoPath)
  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message('Estabelecimento atualizado.')}`)
}

export async function deleteOrArchiveEstablishment(formData: FormData) {
  const { supabase } = await authenticatedClient()
  const establishmentId = String(formData.get('establishment_id') ?? '').trim()
  if (!establishmentId) redirect('/app/comprando')

  const [{ data: current }, { count: purchaseCount }] = await Promise.all([
    supabase.from('establishments').select('id,name,photo_path').eq('id', establishmentId).single(),
    supabase.from('purchases').select('*', { head: true, count: 'exact' }).eq('establishment_id', establishmentId),
  ])
  if (!current) redirect(`/app/comprando?error=${message('Estabelecimento não encontrado.')}`)

  if ((purchaseCount ?? 0) > 0) {
    const { error } = await supabase.from('establishments').update({ archived_at: new Date().toISOString() }).eq('id', establishmentId)
    if (error) redirect(`/app/comprando?error=${message('Não foi possível arquivar o estabelecimento.')}`)
    revalidateConsumptionPages()
    redirect(`/app/comprando?message=${message('Estabelecimento arquivado. O histórico de compras nesse local foi preservado.')}`)
  }

  const { error } = await supabase.from('establishments').delete().eq('id', establishmentId)
  if (error) redirect(`/app/comprando?error=${message('Não foi possível excluir o estabelecimento.')}`)
  if (current.photo_path) await supabase.storage.from(MEDIA_BUCKET).remove([current.photo_path])
  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message('Estabelecimento excluído.')}`)
}

type PurchaseItemInput = {
  productId: string
  quantity: string | number
  unitPrice: string | number
  discount?: string | number
  isPromotion?: boolean
  notes?: string
}

function parseItems(raw: string): PurchaseItemInput[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function normalizedPurchasePayload(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const establishmentId = String(formData.get('establishment_id') ?? '').trim()
  const purchasedAt = String(formData.get('purchased_at_iso') ?? '').trim()
  const paymentMethod = String(formData.get('payment_method') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const rawItems = parseItems(String(formData.get('items_json') ?? '[]'))

  if (!establishmentId) throw new Error('Selecione o estabelecimento.')
  if (!purchasedAt || Number.isNaN(Date.parse(purchasedAt))) throw new Error('Informe uma data válida.')
  if (!rawItems.length) throw new Error('Adicione pelo menos um produto à compra.')

  const { data: establishment } = await supabase
    .from('establishments')
    .select('id,name')
    .eq('id', establishmentId)
    .is('archived_at', null)
    .single()

  if (!establishment) throw new Error('Estabelecimento inválido.')

  const productIds = [...new Set(rawItems.map((item) => String(item.productId)).filter(Boolean))]
  const { data: products } = await supabase
    .from('products')
    .select('id,name,brand,presentation,base_quantity,unit,packaging,subcategory,category_id')
    .in('id', productIds)
    .is('archived_at', null)

  if (!products || products.length !== productIds.length) throw new Error('Um dos produtos selecionados não está disponível.')
  const productMap = new Map(products.map((product) => [product.id, product]))

  const items = rawItems.map((item) => {
    const product = productMap.get(String(item.productId))
    if (!product) throw new Error('Produto inválido.')
    const quantity = Number(String(item.quantity).replace(',', '.'))
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantidade comprada inválida.')
    const unitPriceCents = parseMoneyToCents(item.unitPrice)
    const discountCents = parseMoneyToCents(item.discount ?? 0)
    const gross = Math.round(unitPriceCents * quantity)
    const totalCents = Math.max(0, gross - discountCents)

    return {
      product_id: product.id,
      user_id: userId,
      product_snapshot: {
        name: product.name,
        brand: product.brand,
        presentation: product.presentation,
        base_quantity: product.base_quantity,
        unit: product.unit,
        packaging: product.packaging,
        subcategory: product.subcategory,
        category_id: product.category_id,
      },
      quantity,
      unit_price_cents: unitPriceCents,
      discount_cents: Math.min(discountCents, gross),
      total_cents: totalCents,
      is_promotion: Boolean(item.isPromotion) || discountCents > 0,
      notes: String(item.notes ?? '').trim() || null,
    }
  })

  const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.unit_price_cents * item.quantity), 0)
  const discountCents = items.reduce((sum, item) => sum + item.discount_cents, 0)
  const totalCents = items.reduce((sum, item) => sum + item.total_cents, 0)

  return {
    supabase,
    establishment,
    purchasedAt,
    paymentMethod,
    notes,
    items,
    subtotalCents,
    discountCents,
    totalCents,
  }
}

export async function createPurchase(formData: FormData) {
  try {
    const payload = await normalizedPurchasePayload(formData)
    const { data: purchase, error: purchaseError } = await payload.supabase
      .from('purchases')
      .insert({
        establishment_id: payload.establishment.id,
        establishment_name_snapshot: payload.establishment.name,
        purchased_at: payload.purchasedAt,
        subtotal_cents: payload.subtotalCents,
        discount_cents: payload.discountCents,
        total_cents: payload.totalCents,
        payment_method: payload.paymentMethod || null,
        notes: payload.notes || null,
      })
      .select('id')
      .single()

    if (purchaseError || !purchase) throw new Error('Não foi possível criar a compra.')

    const rows = payload.items.map((item) => ({ ...item, purchase_id: purchase.id }))
    const { error: itemError } = await payload.supabase.from('purchase_items').insert(rows)

    if (itemError) {
      await payload.supabase.from('purchases').delete().eq('id', purchase.id)
      throw new Error('Não foi possível salvar os itens da compra.')
    }

    revalidateConsumptionPages()
    redirect(`/app/comprando?purchase=${purchase.id}&message=${message('Compra registrada. Veja o que o ComInfla identificou.')}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error
    const text = error instanceof Error ? error.message : 'Não foi possível registrar a compra.'
    redirect(`/app/comprando?error=${message(text)}`)
  }
}

export async function updatePurchase(formData: FormData) {
  const purchaseId = String(formData.get('purchase_id') ?? '').trim()
  if (!purchaseId) redirect('/app/comprando')

  try {
    const payload = await normalizedPurchasePayload(formData)
    const { data: currentItems } = await payload.supabase.from('purchase_items').select('id').eq('purchase_id', purchaseId)
    const itemIds = currentItems?.map((item) => item.id) ?? []

    if (itemIds.length) await payload.supabase.from('insight_events').delete().in('purchase_item_id', itemIds)
    await payload.supabase.from('purchase_items').delete().eq('purchase_id', purchaseId)

    const { error: updateError } = await payload.supabase.from('purchases').update({
      establishment_id: payload.establishment.id,
      establishment_name_snapshot: payload.establishment.name,
      purchased_at: payload.purchasedAt,
      subtotal_cents: payload.subtotalCents,
      discount_cents: payload.discountCents,
      total_cents: payload.totalCents,
      payment_method: payload.paymentMethod || null,
      notes: payload.notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', purchaseId)

    if (updateError) throw new Error('Não foi possível atualizar a compra.')
    const rows = payload.items.map((item) => ({ ...item, purchase_id: purchaseId }))
    const { error: insertError } = await payload.supabase.from('purchase_items').insert(rows)
    if (insertError) throw new Error('A compra foi atualizada, mas os itens não puderam ser gravados.')

    revalidateConsumptionPages()
    redirect(`/app/comprando?purchase=${purchaseId}&message=${message('Compra atualizada e indicadores recalculados.')}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error
    const text = error instanceof Error ? error.message : 'Não foi possível atualizar a compra.'
    redirect(`/app/comprando/compra/${purchaseId}/editar?error=${message(text)}`)
  }
}

export async function deletePurchase(formData: FormData) {
  const { supabase } = await authenticatedClient()
  const purchaseId = String(formData.get('purchase_id') ?? '').trim()
  if (!purchaseId) redirect('/app/comprando')

  const { data: items } = await supabase.from('purchase_items').select('id').eq('purchase_id', purchaseId)
  const itemIds = items?.map((item) => item.id) ?? []
  if (itemIds.length) await supabase.from('insight_events').delete().in('purchase_item_id', itemIds)
  const { error: itemsError } = await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId)
  if (itemsError) redirect(`/app/comprando?error=${message('Não foi possível excluir os itens da compra.')}`)

  const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)
  if (error) redirect(`/app/comprando?error=${message('Não foi possível excluir a compra.')}`)

  revalidateConsumptionPages()
  redirect(`/app/comprando?message=${message('Compra excluída. Os indicadores serão calculados sem esse registro.')}`)
}
