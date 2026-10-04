'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SearchableSelect } from '@/components/searchable-select'

type ProductOption = {
  id: string
  label: string
  meta?: string
}

export function CompareControls({
  years,
  baseYear,
  compareYear,
  products,
  selectedIds,
  currentYear,
}: {
  years: number[]
  baseYear: number
  compareYear: number
  products: ProductOption[]
  selectedIds: string[]
  currentYear: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [base, setBase] = useState(String(baseYear))
  const [compare, setCompare] = useState(String(compareYear))
  const [selected, setSelected] = useState<string[]>(selectedIds)
  const [query, setQuery] = useState('')

  const yearOptions = years.map((year) => ({
    value: String(year),
    label: year === currentYear ? `${year} · Atual` : String(year),
    meta: year === currentYear ? 'Período atual até hoje' : 'Ano encerrado',
  }))

  const filtered = useMemo(() => {
    const term = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    if (!term) return products
    return products.filter((product) => `${product.label} ${product.meta ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term))
  }, [products, query])

  function toggleProduct(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function apply() {
    const params = new URLSearchParams()
    params.set('base', base)
    params.set('compare', compare)
    if (selected.length) params.set('products', selected.join(','))
    startTransition(() => router.push(`/app/comparar?${params.toString()}`))
  }

  return (
    <section className="premium-card compare-control-card">
      <div className="compare-period-grid">
        <label className="field">
          <span>Período base</span>
          <SearchableSelect options={yearOptions} value={base} onChange={setBase} searchPlaceholder="Buscar ano..." ariaLabel="Selecionar período base" />
        </label>
        <div className="compare-arrow" aria-hidden="true">→</div>
        <label className="field">
          <span>Período de comparação</span>
          <SearchableSelect options={yearOptions} value={compare} onChange={setCompare} searchPlaceholder="Buscar ano..." ariaLabel="Selecionar período de comparação" />
        </label>
      </div>

      <div className="compare-product-picker">
        <div className="compare-picker-heading">
          <div>
            <span className="page-kicker">PRODUTOS DA COMPARAÇÃO</span>
            <strong>Escolha quais produtos entram no índice</strong>
            <small>Somente produtos com preço nos dois períodos conseguem compor a inflação comparável.</small>
          </div>
          <div className="compare-picker-actions">
            <button type="button" className="ghost-button" onClick={() => setSelected(products.map((product) => product.id))}>Selecionar todos</button>
            <button type="button" className="ghost-button" onClick={() => setSelected([])}>Limpar</button>
          </div>
        </div>

        <div className="compare-search-box">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, marca ou apresentação..." />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">×</button> : null}
        </div>

        <div className="compare-product-list">
          {filtered.length ? filtered.map((product) => {
            const checked = selected.includes(product.id)
            return (
              <button type="button" key={product.id} className={checked ? 'selected' : ''} onClick={() => toggleProduct(product.id)}>
                <span className="compare-check" aria-hidden="true">{checked ? '✓' : ''}</span>
                <span><strong>{product.label}</strong>{product.meta ? <small>{product.meta}</small> : null}</span>
              </button>
            )
          }) : <div className="compare-empty-search">Nenhum produto encontrado.</div>}
        </div>

        <div className="compare-control-footer">
          <span><strong>{selected.length}</strong> {selected.length === 1 ? 'produto selecionado' : 'produtos selecionados'}</span>
          <button type="button" className="button button-primary" onClick={apply} disabled={pending || !selected.length || base === compare}>
            {pending ? 'Comparando…' : base === compare ? 'Escolha anos diferentes' : 'Comparar períodos'}
          </button>
        </div>
      </div>
    </section>
  )
}
