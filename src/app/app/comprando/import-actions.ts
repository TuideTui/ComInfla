'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ImportedPurchasePayload as ImportedPurchasePayloadType, ImportedPurchaseResult } from '@/lib/receipt-import-types'
export type { ImportedPurchasePayload } from '@/lib/receipt-import-types'

async function authenticatedClient() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { supabase, userId: null }
  return { supabase, userId }
}

function refreshConsumptionPages() {
  revalidatePath('/app')
  revalidatePath('/app/comprando')
  revalidatePath('/app/analises')
  revalidatePath('/app/comparar')
  revalidatePath('/app/fechamento')
  revalidatePath('/app/mapa')
  revalidatePath('/app/cadastrando')
}

export async function checkReceiptFingerprint(fingerprint: string): Promise<{ duplicate: boolean; purchaseId: string | null }> {
  const clean = String(fingerprint ?? '').trim()
  if (!clean) return { duplicate: false, purchaseId: null }
  const { supabase, userId } = await authenticatedClient()
  if (!userId) return { duplicate: false, purchaseId: null }

  const { data } = await supabase
    .from('receipt_imports')
    .select('purchase_id')
    .eq('fingerprint', clean)
    .maybeSingle()

  return { duplicate: Boolean(data?.purchase_id), purchaseId: data?.purchase_id ?? null }
}

export async function registerImportedPurchase(payload: ImportedPurchasePayloadType): Promise<ImportedPurchaseResult> {
  const { supabase, userId } = await authenticatedClient()
  if (!userId) return { ok: false, message: 'Sua sessão expirou. Entre novamente para registrar a compra.' }

  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return { ok: false, message: 'Revise a importação e mantenha pelo menos um item antes de registrar.' }
  }

  if (!payload.establishment_id && !payload.new_establishment?.name?.trim()) {
    return { ok: false, message: 'Escolha um estabelecimento ou informe o nome do novo local.' }
  }

  const { data, error } = await supabase.rpc('register_receipt_purchase', { p_payload: payload })
  if (error) {
    const raw = `${error.message ?? ''} ${error.details ?? ''}`
    if (raw.includes('DUPLICATE_RECEIPT')) {
      const purchaseId = raw.match(/DUPLICATE_RECEIPT:([0-9a-f-]{36})/i)?.[1] ?? null
      return { ok: false, duplicate: true, purchaseId, message: 'Este comprovante já parece ter sido registrado anteriormente.' }
    }
    if (raw.includes('INVALID_ESTABLISHMENT')) return { ok: false, message: 'O estabelecimento selecionado não está mais disponível.' }
    if (raw.includes('INVALID_PRODUCT')) return { ok: false, message: 'Um dos produtos vinculados não está mais disponível.' }
    if (raw.includes('INVALID_ITEM_VALUES')) return { ok: false, message: 'Um dos itens possui quantidade ou preço inválido.' }
    return { ok: false, message: 'Não foi possível registrar a compra importada. Revise os dados e tente novamente.' }
  }

  refreshConsumptionPages()
  const result = (data ?? {}) as Record<string, unknown>
  return {
    ok: true,
    message: 'Compra importada e registrada com sucesso.',
    purchaseId: typeof result.purchase_id === 'string' ? result.purchase_id : null,
    createdProducts: Number(result.created_products ?? 0),
    createdEstablishment: Boolean(result.created_establishment),
    itemCount: Number(result.item_count ?? payload.items.length),
    calculatedTotalCents: Number(result.calculated_total_cents ?? 0),
    receiptTotalCents: Number(result.receipt_total_cents ?? payload.receipt_total_cents ?? 0),
  }
}
