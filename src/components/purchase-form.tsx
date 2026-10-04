'use client'

import { useMemo, useState } from 'react'
import { createPurchase, updatePurchase } from '@/app/app/comprando/actions'

type ProductOption = {
  id: string
  name: string
  brand: string | null
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
  const quantity = `${Number(product.base_quantity).toLocaleString('pt-BR')} ${product.unit === 'l' ? 'L' : product.unit}`
  return `${brand}${product.name} · ${quantity}`
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
        <label className="field">
          <span>Estabelecimento</span>
          <select name="establishment_id" value={establishmentId} onChange={(event) => setEstablishmentId(event.target.value)} required>
            {establishments.map((item) => (
              <option key={item.id} value={item.id}>{item.name}{item.neighborhood ? ` · ${item.neighborhood}` : ''}</option>
            ))}
          </select>
        </label>
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
          <div><strong>Itens da compra</strong><span>Você pode registrar vários produtos no mesmo estabelecimento.</span></div>
          <button type="button" className="ghost-button" onClick={() => setItems((current) => [...current, blankItem(products[0]?.id ?? '')])}>+ Adicionar item</button>
        </div>

        {items.map((item, index) => (
          <div className="purchase-item-row" key={item.key}>
            <span className="item-number">{String(index + 1).padStart(2, '0')}</span>
            <label className="field item-product"><span>Produto</span>
              <select value={item.productId} onChange={(event) => updateItem(item.key, { productId: event.target.value })} required>
                <option value="" disabled>Selecione</option>
                {products.map((product) => <option value={product.id} key={product.id}>{productText(product)}</option>)}
              </select>
            </label>
            <label className="field item-qty"><span>Qtd.</span><input inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} required /></label>
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
