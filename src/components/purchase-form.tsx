'use client'

import { useMemo, useState } from 'react'
import { createPurchase, updatePurchase } from '@/app/app/comprando/actions'
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select'

type ProductOption = {
  id: string
  name: string
  brand: string | null
  presentation?: string | null
  base_quantity: number | string
  unit: string
  packaging: string | null
}

type EstablishmentOption = {
  id: string
  name: string
  neighborhood: string | null
  visit_frequency: string
}

type EditableItem = {
  key: string
  productId: string
  quantity: string
  unitPrice: string
  discount: string
  isPromotion: boolean
  notes: string
}

type InitialPurchase = {
  id: string
  establishmentId: string
  purchasedAt: string
  paymentMethod: string
  notes: string
  items: Array<{
    productId: string
    quantity: number | string
    unitPriceCents: number
    discountCents: number
    isPromotion: boolean
    notes?: string | null
  }>
}

function localInputValue(value: string | Date) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function parseMoney(value: string) {
  const clean = value.trim().replace(/\s/g, '')
  if (!clean) return 0
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const number = Number(normalized)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function productText(product: ProductOption) {
  const brand = product.brand ? `${product.brand} · ` : ''
  const presentation = product.presentation ? ` · ${product.presentation}` : ''
  return `${brand}${product.name}${presentation}`
}

function frequencyText(value: string) {
  if (value === 'frequent') return 'Frequente'
  if (value === 'one_time') return 'Visita única'
  return 'Ocasional'
}

function blankItem(productId = ''): EditableItem {
  return { key: `${Date.now()}-${Math.random()}`, productId, quantity: '1', unitPrice: '', discount: '', isPromotion: false, notes: '' }
}

export function PurchaseForm({
  products,
  establishments,
  initial,
}: {
  products: ProductOption[]
  establishments: EstablishmentOption[]
  initial?: InitialPurchase
}) {
  const [establishmentId, setEstablishmentId] = useState(initial?.establishmentId ?? establishments[0]?.id ?? '')
  const [purchasedAt, setPurchasedAt] = useState(localInputValue(initial?.purchasedAt ?? new Date()))
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [items, setItems] = useState<EditableItem[]>(
    initial?.items.length
      ? initial.items.map((item, index) => ({
          key: `${index}-${item.productId}`,
          productId: item.productId,
          quantity: String(item.quantity).replace('.', ','),
          unitPrice: moneyFromCents(item.unitPriceCents),
          discount: item.discountCents ? moneyFromCents(item.discountCents) : '',
          isPromotion: item.isPromotion,
          notes: item.notes ?? '',
        }))
      : [blankItem(products[0]?.id ?? '')]
  )

  const establishmentOptions = useMemo<SearchableOption[]>(() => establishments.map((item) => ({
    value: item.id,
    label: item.name,
    meta: [item.neighborhood, frequencyText(item.visit_frequency)].filter(Boolean).join(' · '),
    searchText: `${item.name} ${item.neighborhood ?? ''} ${frequencyText(item.visit_frequency)}`,
  })), [establishments])

  const productOptions = useMemo<SearchableOption[]>(() => products.map((product) => ({
    value: product.id,
    label: productText(product),
    meta: product.packaging || undefined,
    searchText: `${product.name} ${product.brand ?? ''} ${product.presentation ?? ''} ${product.packaging ?? ''}`,
  })), [products])

  const total = useMemo(() => items.reduce((sum, item) => {
    const quantity = Number(item.quantity.replace(',', '.')) || 0
    return sum + Math.max(0, parseMoney(item.unitPrice) * quantity - parseMoney(item.discount))
  }, 0), [items])

  const isoDate = useMemo(() => {
    const date = new Date(purchasedAt)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }, [purchasedAt])

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  function removeItem(key: string) {
    setItems((current) => current.length === 1 ? current : current.filter((item) => item.key !== key))
  }

  const action = initial?.id ? updatePurchase : createPurchase
  const jsonItems = items.map(({ key: _key, ...item }) => item)

  return (
    <form action={action} className="purchase-form">
      {initial?.id ? <input type="hidden" name="purchase_id" value={initial.id} /> : null}
      <input type="hidden" name="purchased_at_iso" value={isoDate} />
      <input type="hidden" name="items_json" value={JSON.stringify(jsonItems)} />

      <div className="purchase-main-grid">
        <div className="field">
          <span>Estabelecimento</span>
          <SearchableSelect
            name="establishment_id"
            value={establishmentId}
            onChange={setEstablishmentId}
            options={establishmentOptions}
            placeholder="Selecione um estabelecimento"
            searchPlaceholder="Buscar estabelecimento..."
            emptyMessage="Nenhum estabelecimento encontrado."
            ariaLabel="Selecionar estabelecimento"
            required
          />
        </div>
        <label className="field">
          <span>Data e horário</span>
          <input type="datetime-local" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} required />
        </label>
        <label className="field">
          <span>Pagamento</span>
          <select name="payment_method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="">Não informar</option>
            <option value="credit_card">Cartão de crédito</option>
            <option value="debit_card">Cartão de débito</option>
            <option value="pix">Pix</option>
            <option value="cash">Dinheiro</option>
            <option value="benefit">VA / VR</option>
            <option value="other">Outro</option>
          </select>
        </label>
      </div>

      <div className="purchase-items">
        <div className="section-inline-heading">
          <div><strong>Itens da compra</strong><span>Agora a quantidade abaixo representa somente quanto você comprou naquele momento.</span></div>
          <button type="button" className="ghost-button" onClick={() => setItems((current) => [...current, blankItem(products[0]?.id ?? '')])}>+ Adicionar item</button>
        </div>

        {items.map((item, index) => (
          <div className="purchase-item-row" key={item.key}>
            <span className="item-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="field item-product">
              <span>Produto</span>
              <SearchableSelect
                value={item.productId}
                onChange={(productId) => updateItem(item.key, { productId })}
                options={productOptions}
                placeholder="Selecione um produto"
                searchPlaceholder="Buscar produto, marca ou apresentação..."
                emptyMessage="Nenhum produto encontrado."
                ariaLabel={`Selecionar produto do item ${index + 1}`}
              />
            </div>
            <label className="field item-qty"><span>Qtd. comprada</span><input inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} required /></label>
            <label className="field item-price"><span>Preço unit.</span><div className="money-input"><b>R$</b><input inputMode="decimal" placeholder="0,00" value={item.unitPrice} onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })} required /></div></label>
            <label className="field item-discount"><span>Desconto</span><div className="money-input"><b>R$</b><input inputMode="decimal" placeholder="0,00" value={item.discount} onChange={(event) => updateItem(item.key, { discount: event.target.value, isPromotion: event.target.value.length > 0 ? true : item.isPromotion })} /></div></label>
            <label className="check-field"><input type="checkbox" checked={item.isPromotion} onChange={(event) => updateItem(item.key, { isPromotion: event.target.checked })} /><span>Promoção</span></label>
            <button type="button" className="icon-button" onClick={() => removeItem(item.key)} disabled={items.length === 1} aria-label="Remover item">×</button>
          </div>
        ))}
      </div>

      <label className="field"><span>Observação da compra</span><textarea name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Opcional: contexto, promoção, evento, viagem..." /></label>

      <div className="purchase-footer">
        <div><span>Total estimado</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
        <button className="button button-primary" type="submit">{initial?.id ? 'Salvar alterações' : 'Registrar compra'}</button>
      </div>
    </form>
  )
}
