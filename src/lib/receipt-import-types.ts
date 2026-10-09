export type ImportedPurchasePayload = {
  fingerprint: string
  establishment_id?: string | null
  new_establishment?: { name: string; type?: string; city?: string; state?: string }
  purchased_at?: string
  payment_method?: string
  notes?: string
  source_kind?: 'nfce' | 'delivery' | 'receipt' | 'unknown'
  source_document_key?: string
  merchant_name?: string
  merchant_cnpj?: string
  extra_fees_cents?: number
  order_discount_cents?: number
  receipt_total_cents?: number
  file_count?: number
  metadata?: Record<string, unknown>
  extraction_metadata?: Record<string, unknown>
  items: Array<{
    product_id?: string | null
    name?: string
    brand?: string
    presentation?: string | null
    unit?: string
    packaging?: string | null
    barcode?: string | null
    quantity: number
    unit_price_cents: number
    discount_cents?: number
    is_promotion?: boolean
    notes?: string | null
  }>
}

export type ImportedPurchaseResult =
  | {
      ok: true
      message: string
      purchaseId: string | null
      createdProducts: number
      createdEstablishment: boolean
      itemCount: number
      calculatedTotalCents: number
      receiptTotalCents: number
    }
  | {
      ok: false
      message: string
      duplicate?: boolean
      purchaseId?: string | null
    }
