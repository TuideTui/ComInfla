import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { CompareControls } from '@/components/compare-controls'
import { createClient } from '@/lib/supabase/server'
import { formatBRL, formatPercent, productLabel } from '@/lib/format'

type PriceItem = {
  product_id: string
  unit_price_cents: number
  total_cents: number
  quantity: number | string
  product: any
  purchase: { purchased_at: string } | null
}

type DateParts = { year: number; month: number; day: number }

function saoPauloParts(value: Date | string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day') }
}

function rowInsideYear(row: PriceItem, year: number, matchedYtd: boolean, cutoff: DateParts) {
  if (!row.purchase?.purchased_at) return false
  const date = saoPauloParts(row.purchase.purchased_at)
  if (date.year !== year) return false
  if (!matchedYtd) return true
  return date.month < cutoff.month || (date.month === cutoff.month && date.day <= cutoff.day)
}

function weightedAveragePrice(rows: PriceItem[]) {
  let total = 0
  let quantity = 0
  for (const row of rows) {
    const q = Number(row.quantity)
    if (!Number.isFinite(q) || q <= 0) continue
    total += Number(row.total_cents ?? 0)
    quantity += q
  }
  if (!quantity) return 0
  return total / quantity
}

function monthDayLabel(cutoff: DateParts) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(2024, cutoff.month - 1, cutoff.day))
    .replace('.', '')
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: rawProducts }, { data: rawItems }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('products').select('id,name,brand,presentation,packaging,archived_at,category:categories(name)').order('name'),
    supabase.from('purchase_items').select('product_id,unit_price_cents,total_cents,quantity,product:products(id,name,brand,presentation,base_quantity,unit,packaging),purchase:purchases(purchased_at)').order('created_at'),
  ])

  const products = (rawProducts ?? []) as any[]
  const items = (rawItems ?? []) as unknown as PriceItem[]
  const today = saoPauloParts(new Date())
  const currentYear = today.year
  const dataYears = items.map((item) => item.purchase?.purchased_at ? saoPauloParts(item.purchase.purchased_at).year : null).filter((year): year is number => Boolean(year))
  const earliestDataYear = dataYears.length ? Math.min(...dataYears) : currentYear
  const earliestYear = Math.min(earliestDataYear, currentYear - 1)
  const years = Array.from({ length: currentYear - earliestYear + 1 }, (_, index) => currentYear - index)

  const requestedBase = Number(typeof params.base === 'string' ? params.base : currentYear - 1)
  const requestedCompare = Number(typeof params.compare === 'string' ? params.compare : currentYear)
  const baseYear = years.includes(requestedBase) ? requestedBase : Math.max(earliestYear, currentYear - 1)
  const compareYear = years.includes(requestedCompare) ? requestedCompare : currentYear

  const validProductIds = new Set(products.map((product) => product.id))
  const requestedProducts = typeof params.products === 'string' ? params.products.split(',').filter((id) => validProductIds.has(id)) : []
  const productsWithHistory = new Set(items.map((item) => item.product_id))
  const selectedIds = requestedProducts.length ? requestedProducts : products.filter((product) => productsWithHistory.has(product.id)).map((product) => product.id)
  const selectedSet = new Set(selectedIds)

  const matchedYtd = baseYear === currentYear || compareYear === currentYear
  const baseRows = items.filter((item) => selectedSet.has(item.product_id) && rowInsideYear(item, baseYear, matchedYtd, today))
  const compareRows = items.filter((item) => selectedSet.has(item.product_id) && rowInsideYear(item, compareYear, matchedYtd, today))

  const rowsByProduct = selectedIds.map((productId) => {
    const product = products.find((item) => item.id === productId) ?? items.find((item) => item.product_id === productId)?.product
    const base = baseRows.filter((item) => item.product_id === productId)
    const comparison = compareRows.filter((item) => item.product_id === productId)
    const baseAverage = weightedAveragePrice(base)
    const compareAverage = weightedAveragePrice(comparison)
    const comparable = baseAverage > 0 && compareAverage > 0
    const deltaCents = comparable ? compareAverage - baseAverage : null
    const deltaPercent = comparable ? ((compareAverage / baseAverage) - 1) * 100 : null
    return { productId, product, base, comparison, baseAverage, compareAverage, comparable, deltaCents, deltaPercent }
  })

  const comparable = rowsByProduct.filter((row) => row.comparable)
  const basketBase = comparable.reduce((sum, row) => sum + row.baseAverage, 0)
  const basketCompare = comparable.reduce((sum, row) => sum + row.compareAverage, 0)
  const basketDelta = comparable.length ? basketCompare - basketBase : null
  const basketInflation = basketBase > 0 ? ((basketCompare / basketBase) - 1) * 100 : null
  const averageInflation = comparable.length ? comparable.reduce((sum, row) => sum + Number(row.deltaPercent ?? 0), 0) / comparable.length : null
  const sortedVariation = [...comparable].sort((a, b) => Number(b.deltaPercent) - Number(a.deltaPercent))
  const biggestIncrease = sortedVariation.find((row) => Number(row.deltaPercent) > 0)
  const biggestDrop = [...sortedVariation].reverse().find((row) => Number(row.deltaPercent) < 0)
  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const cutoffText = monthDayLabel(today)
  const periodExplanation = matchedYtd
    ? `Para manter a comparação justa, os dois anos usam o mesmo intervalo: 1 jan até ${cutoffText}.`
    : 'Os dois períodos representam o ano completo, de janeiro a dezembro.'

  const productOptions = products.filter((product) => productsWithHistory.has(product.id)).map((product) => ({
    id: product.id,
    label: productLabel(product),
    meta: [product.category?.name, product.packaging, product.archived_at ? 'Arquivado' : null].filter(Boolean).join(' · '),
  }))

  return (
    <main className="app-shell">
      <AppHeader active="comparar" firstName={firstName} />
      <section className="app-content">
        <div className="dashboard-heading compare-heading">
          <div>
            <span className="page-kicker">PREÇO × PERÍODO</span>
            <h1>Comparar</h1>
            <p>Escolha produtos e descubra quanto a mesma cesta ficou mais cara ou mais barata entre dois períodos.</p>
          </div>
        </div>

        <CompareControls years={years} baseYear={baseYear} compareYear={compareYear} products={productOptions} selectedIds={selectedIds} currentYear={currentYear} />

        <div className="compare-method-note">
          <strong>{baseYear} → {compareYear}</strong>
          <span>{periodExplanation}</span>
        </div>

        {!selectedIds.length ? (
          <section className="premium-card work-card empty-analytics"><span className="page-kicker">ESCOLHA PRODUTOS</span><h2>Selecione pelo menos um produto</h2><p>Os produtos escolhidos formarão uma cesta comparável entre os dois períodos.</p></section>
        ) : !comparable.length ? (
          <section className="premium-card work-card empty-analytics">
            <span className="page-kicker">SEM BASE COMPARÁVEL</span>
            <h2>Ainda não há o mesmo produto nos dois períodos</h2>
            <p>Você selecionou {selectedIds.length} {selectedIds.length === 1 ? 'produto' : 'produtos'}, mas precisamos ter ao menos um preço registrado em {baseYear} e outro em {compareYear} para o mesmo item.</p>
          </section>
        ) : (
          <>
            <div className="compare-metric-grid">
              <article className="premium-card compare-hero-metric">
                <span>INFLAÇÃO DA SELEÇÃO</span>
                <strong className={Number(basketInflation) > 0 ? 'warm' : Number(basketInflation) < 0 ? 'cool' : ''}>{formatPercent(basketInflation)}</strong>
                <small>Cesta equivalente de 1 unidade de cada produto comparável</small>
              </article>
              <article className="premium-card compare-metric-card">
                <span>AUMENTO EM REAIS</span>
                <strong>{basketDelta === null ? '—' : `${basketDelta > 0 ? '+' : ''}${formatBRL(basketDelta)}`}</strong>
                <small>{formatBRL(basketBase)} → {formatBRL(basketCompare)}</small>
              </article>
              <article className="premium-card compare-metric-card">
                <span>VARIAÇÃO MÉDIA DOS PRODUTOS</span>
                <strong>{formatPercent(averageInflation)}</strong>
                <small>Cada produto recebe o mesmo peso neste indicador</small>
              </article>
              <article className="premium-card compare-metric-card">
                <span>COBERTURA DA COMPARAÇÃO</span>
                <strong>{comparable.length}/{selectedIds.length}</strong>
                <small>{selectedIds.length === comparable.length ? 'Todos os selecionados têm histórico nos dois períodos' : 'Alguns produtos não existem nos dois períodos'}</small>
              </article>
            </div>

            <section className="compare-insight-strip">
              <article className="premium-card">
                <span className="page-kicker">LEITURA RÁPIDA</span>
                <h2>{basketInflation !== null && basketInflation >= 0 ? `Sua cesta selecionada ficou ${formatPercent(basketInflation)} mais cara.` : `Sua cesta selecionada ficou ${formatPercent(Math.abs(Number(basketInflation)))} mais barata.`}</h2>
                <p>Comprar uma unidade de cada produto comparável custaria {formatBRL(basketBase)} em {baseYear} e {formatBRL(basketCompare)} em {compareYear}, uma diferença de {formatBRL(Math.abs(Number(basketDelta)))}.</p>
              </article>
              <article className="premium-card compare-extremes">
                <div><span>MAIOR ALTA</span>{biggestIncrease ? <><strong>{productLabel(biggestIncrease.product)}</strong><b className="warm">{formatPercent(biggestIncrease.deltaPercent)}</b></> : <strong>Nenhuma alta</strong>}</div>
                <div><span>MAIOR QUEDA</span>{biggestDrop ? <><strong>{productLabel(biggestDrop.product)}</strong><b className="cool">{formatPercent(biggestDrop.deltaPercent)}</b></> : <strong>Nenhuma queda</strong>}</div>
              </article>
            </section>

            <section className="premium-card work-card compare-detail-card">
              <div className="section-inline-heading">
                <div><span className="page-kicker">PRODUTO A PRODUTO</span><h2>Como cada preço mudou</h2><p>O preço médio efetivamente pago considera quantidade e desconto registrados em cada compra.</p></div>
              </div>
              <div className="compare-table-head"><span>Produto</span><span>{baseYear}</span><span>{compareYear}</span><span>Diferença</span><span>Inflação</span></div>
              <div className="compare-table-body">
                {rowsByProduct.map((row) => (
                  <div className={`compare-product-row${row.comparable ? '' : ' unavailable'}`} key={row.productId}>
                    <div><strong>{productLabel(row.product)}</strong><small>{row.base.length} reg. em {baseYear} · {row.comparison.length} reg. em {compareYear}</small></div>
                    <b>{row.baseAverage ? formatBRL(row.baseAverage) : '—'}</b>
                    <b>{row.compareAverage ? formatBRL(row.compareAverage) : '—'}</b>
                    <b className={Number(row.deltaCents) > 0 ? 'warm' : Number(row.deltaCents) < 0 ? 'cool' : ''}>{row.deltaCents === null ? '—' : `${row.deltaCents > 0 ? '+' : ''}${formatBRL(row.deltaCents)}`}</b>
                    <strong className={Number(row.deltaPercent) > 0 ? 'warm' : Number(row.deltaPercent) < 0 ? 'cool' : ''}>{formatPercent(row.deltaPercent)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="compare-methodology premium-card">
              <span className="page-kicker">COMO O ÍNDICE É CALCULADO</span>
              <h2>Inflação de preço, não aumento de gasto</h2>
              <p>Para cada produto, o ComInfla calcula o preço médio efetivamente pago em cada período. A “Inflação da seleção” compara o custo de uma cesta fixa com uma unidade de cada produto que possui dados nos dois períodos. Assim, comprar mais unidades em um ano não é confundido com inflação.</p>
              <small>Este índice representa somente a seleção atual. O Índice de Inflação Pessoal completo terá uma cesta pessoal e pesos próprios quando houver histórico suficiente.</small>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
