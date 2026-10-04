'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const MEDIA_BUCKET = 'cominfla-media'

function message(value: string) {
  return encodeURIComponent(value)
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
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

function revalidateConsumptionPages() {
  revalidatePath('/app')
  revalidatePath('/app/cadastrando')
  revalidatePath('/app/comprando')
  revalidatePath('/app/analises')
  revalidatePath('/app/comparar')
  revalidatePath('/app/fechamento')
  revalidatePath('/app/mapa')
}

async function removeOldMedia(supabase: any, previousPath?: string | null, nextPath?: string | null) {
  if (previousPath && previousPath !== nextPath) {
    await supabase.storage.from(MEDIA_BUCKET).remove([previousPath])
  }
}

export async function createProduct(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const name = text(formData, 'name')
  const brand = text(formData, 'brand')
  const categoryId = text(formData, 'category_id')
  const subcategory = text(formData, 'subcategory')
  const presentation = text(formData, 'presentation')
  const packaging = text(formData, 'packaging')
  const barcode = text(formData, 'barcode')
  const notes = text(formData, 'notes')
  const photoPath = validMediaPath(formData.get('photo_path'), userId, 'products')

  if (!name) redirect(`/app/cadastrando?error=${message('Informe o nome do produto.')}`)

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
    redirect(`/app/cadastrando?error=${message(`Já existe um produto muito parecido: ${duplicate.name}. Edite ou use o cadastro existente.`)}`)
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

  if (error) redirect(`/app/cadastrando?error=${message('Não foi possível cadastrar o produto.')}`)
  revalidateConsumptionPages()
  redirect(`/app/cadastrando?message=${message('Produto cadastrado e pronto para ser usado em novas compras.')}`)
}

export async function updateProduct(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const productId = text(formData, 'product_id')
  const name = text(formData, 'name')
  if (!productId || !name) redirect(`/app/cadastrando?error=${message('Produto inválido.')}`)

  const { data: current } = await supabase.from('products').select('id,photo_path').eq('id', productId).single()
  if (!current) redirect(`/app/cadastrando?error=${message('Produto não encontrado.')}`)

  const brand = text(formData, 'brand')
  const categoryId = text(formData, 'category_id')
  const subcategory = text(formData, 'subcategory')
  const presentation = text(formData, 'presentation')
  const packaging = text(formData, 'packaging')
  const barcode = text(formData, 'barcode')
  const notes = text(formData, 'notes')
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

  if (error) redirect(`/app/cadastrando/produto/${productId}/editar?error=${message('Não foi possível atualizar o produto.')}`)
  await removeOldMedia(supabase, current.photo_path, photoPath)
  revalidateConsumptionPages()
  redirect(`/app/cadastrando?message=${message('Produto atualizado. O histórico de compras foi preservado.')}`)
}

export async function deleteOrArchiveProduct(formData: FormData) {
  const { supabase } = await authenticatedClient()
  const productId = text(formData, 'product_id')
  if (!productId) redirect('/app/cadastrando')

  const [{ data: current }, { count: purchaseCount }, { count: basketCount }] = await Promise.all([
    supabase.from('products').select('id,name,photo_path').eq('id', productId).single(),
    supabase.from('purchase_items').select('*', { head: true, count: 'exact' }).eq('product_id', productId),
    supabase.from('basket_items').select('*', { head: true, count: 'exact' }).eq('product_id', productId),
  ])

  if (!current) redirect(`/app/cadastrando?error=${message('Produto não encontrado.')}`)

  if ((purchaseCount ?? 0) > 0 || (basketCount ?? 0) > 0) {
    const { error } = await supabase.from('products').update({ archived_at: new Date().toISOString() }).eq('id', productId)
    if (error) redirect(`/app/cadastrando?error=${message('Não foi possível arquivar o produto.')}`)
    revalidateConsumptionPages()
    redirect(`/app/cadastrando?message=${message('Produto arquivado. O histórico foi preservado.')}`)
  }

  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) redirect(`/app/cadastrando?error=${message('Não foi possível excluir o produto.')}`)
  if (current.photo_path) await supabase.storage.from(MEDIA_BUCKET).remove([current.photo_path])
  revalidateConsumptionPages()
  redirect(`/app/cadastrando?message=${message('Produto excluído.')}`)
}

export async function deleteOrArchiveEstablishment(formData: FormData) {
  const { supabase } = await authenticatedClient()
  const establishmentId = text(formData, 'establishment_id')
  if (!establishmentId) redirect('/app/cadastrando')

  const [{ data: current }, { count: purchaseCount }] = await Promise.all([
    supabase.from('establishments').select('id,name,photo_path').eq('id', establishmentId).single(),
    supabase.from('purchases').select('*', { head: true, count: 'exact' }).eq('establishment_id', establishmentId),
  ])

  if (!current) redirect(`/app/cadastrando?error=${message('Estabelecimento não encontrado.')}`)

  if ((purchaseCount ?? 0) > 0) {
    const { error } = await supabase.from('establishments').update({ archived_at: new Date().toISOString() }).eq('id', establishmentId)
    if (error) redirect(`/app/cadastrando?error=${message('Não foi possível arquivar o estabelecimento.')}`)
    revalidateConsumptionPages()
    redirect(`/app/cadastrando?message=${message('Estabelecimento arquivado. As compras antigas e o histórico foram preservados.')}`)
  }

  const { error } = await supabase.from('establishments').delete().eq('id', establishmentId)
  if (error) redirect(`/app/cadastrando?error=${message('Não foi possível excluir o estabelecimento.')}`)
  if (current.photo_path) await supabase.storage.from(MEDIA_BUCKET).remove([current.photo_path])
  revalidateConsumptionPages()
  redirect(`/app/cadastrando?message=${message('Estabelecimento excluído.')}`)
}
