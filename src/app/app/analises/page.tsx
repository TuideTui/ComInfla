import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { createClient } from '@/lib/supabase/server'
import { formatBRL, formatPercent, productLabel } from '@/lib/format'

type PriceRow = {
  product_id: string
  unit_price_cents: number
  total_cents: number
  quantity: number
  created_at: string
  product: any
  purchase: any
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: purchases }, { data: rawItems }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('purchases').select('id,purchased_at,total_cents,establishment_id,establishment:establishments(id,name)').order('purchased_at'),
    supabase.from('purchase_items').select('id,product_id,unit_price_cents,total_cents,quantity,created_at,product:products(id,name,brand,base_quantity,unit,packaging,category:categories(name)),purchase:purchases(id,purchased_at,establishment_id,establishment:establishments(id,name))').order('created_at'),
  ])

  const items = (rawItems ?? []) as unknown as PriceRow[]
  const firstName = profile?.full_name?.split(' ')[0] || 'você'

  const monthly = new Map<string, { label: string; total: number }>()
  for (const purchase of purchases ?? []) {
    const date = new Date(purchase.purchased_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date).replace('.', '')
    const current = monthly.get(key) ?? { label, total: 0 }
    current.total += Number(purchase.total_cents ?? 0)
    monthly.set(key, current)
  }
  const monthlyData = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([, value]) => value)
  const maxMonthly = Math.max(1, ...monthlyData.map((item) => item.total))

  const categories = new Map<string, number>()
  for (const item of items) {
    const category = item.product?.category?.name ?? 'Sem categoria'
    categories.set(category, (categories.get(category) ?? 0) + Number(item.total_cents ?? 0))
  }
  const categoryData = [...categories.entries()].sort((a, b) => b[1] - a[1])
  const maxCategory = Math.max(1, ...categoryData.map(([, total]) => total))

  const productGroups = new Map<string, PriceRow[]>()
  for (const item of items) {
    const list = productGroups.get(item.product_id) ?? []
    list.push(item)
    productGroups.set(item.product_id, list)
  }

  const productStats = [...productGroups.entries()].map(([id, rows]) => {
    const prices = rows.map((row) => Number(row.unit_price_cents))
    const sorted = [...rows].sort((a, b) => new Date(a.purchase?.purchased_at ?? a.created_at).getTime() - new Date(b.purchase?.purchased_at ?? b.created_at).getTime())
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length
    const first = prices[0]
    const latest = prices[prices.length - 1]
    const variation = first ? ((latest / first) - 1) * 100 : 0
    const establishments = new Map<string, { name: string; total: number; count: number }>()
    for (const row of rows) {
      const place = row.purchase?.establishment
      const key = place?.id ?? row.purchase?.establishment_id ?? 'sem-local'
      const current = establishments.get(key) ?? { name: place?.name ?? 'Local não identificado', total: 0, count: 0 }
      current.total += Number(row.unit_price_cents)
      current.count += 1
      establishments.set(key, current)
    }
    const placeAverages = [...establishments.values()].map((value) => ({ ...value, average: value.total / value.count })).sort((a, b) => a.average - b.average)
    return { id, product: rows[0].product, average, min: Math.min(...prices), max: Math.max(...prices), latest, count: rows.length, variation, placeAverages }
  }).sort((a, b) => b.count - a.count)

  const totalSpent = (purchases ?? []).reduce((sum, item) => sum + Number(item.total_cents ?? 0), 0)
  const ticket = purchases?.length ? totalSpent / purchases.length : 0
  const mostBought = productStats[0]

  return (
    <main className="app-shell">
      <AppHeader active="analises" firstName={firstName} />
      <section className="app-content">
        <div className="dashboard-heading">
          <div><span className="page-kicker">EXPLORAÇÃO DOS DADOS</span><h1>Análises</h1><p>Entenda preços, gastos e diferenças entre os lugares que fazem parte da sua rotina.</p></div>
        </div>

        <div className="metric-grid analytics-metrics">
          <article className="premium-card metric-card"><span>GASTO ACUMULADO</span><strong>{formatBRL(totalSpent)}</strong><small>{purchases?.length ?? 0} compras no histórico</small></article>
          <article className="premium-card metric-card"><span>TICKET MÉDIO</span><strong>{formatBRL(ticket)}</strong><small>Média por compra</small></article>
          <article className="premium-card metric-card"><span>PRODUTOS COM HISTÓRICO</span><strong>{productStats.length}</strong><small>Itens com pelo menos um preço</small></article>
          <article className="premium-card metric-card"><span>MAIS COMPRADO</span><strong className="metric-text">{mostBought?.product?.name ?? '—'}</strong><small>{mostBought ? `${mostBought.count} registros` : 'Aguardando dados'}</small></article>
        </div>

        {!items.length ? (
          <section className="premium-card work-card empty-analytics"><span className="page-kicker">SEM DADOS SUFICIENTES</span><h2>As análises vão nascer do seu histórico</h2><p>Registre compras na aba Comprando. A partir dos primeiros preços, o ComInfla já começa a calcular médias, extremos e comparações.</p></section>
        ) : (
          <>
            <div className="analytics-grid">
              <section className="premium-card analytics-card">
                <div className="section-inline-heading"><div><span className="page-kicker">GASTOS MENSAIS</span><h2>Evolução do gasto</h2></div></div>
                <div className="monthly-bars">
                  {monthlyData.map((item) => <div key={item.label}><span className="bar-value">{formatBRL(item.total)}</span><div className="vertical-bar" style={{ height: `${Math.max(8, (item.total / maxMonthly) * 100)}%` }} /><small>{item.label}</small></div>)}
                </div>
              </section>
              <section className="premium-card analytics-card">
                <div className="section-inline-heading"><div><span className="page-kicker">POR CATEGORIA</span><h2>Onde seu dinheiro está indo</h2></div></div>
                <div className="horizontal-bars">
                  {categoryData.slice(0, 8).map(([name, total]) => <div key={name}><div><span>{name}</span><strong>{formatBRL(total)}</strong></div><i><b style={{ width: `${Math.max(4, (total / maxCategory) * 100)}%` }} /></i></div>)}
                </div>
              </section>
            </div>

            <section className="premium-card work-card product-analysis">
              <div className="section-inline-heading"><div><span className="page-kicker">PREÇO × TEMPO</span><h2>Análise por produto</h2><p>Média, extremos, preço recente e onde você historicamente encontra o menor valor.</p></div></div>
              <div className="product-stat-grid">
                {productStats.slice(0, 12).map((stat) => (
                  <article className="product-stat-card" key={stat.id}>
                    <div className="product-stat-title"><strong>{productLabel(stat.product)}</strong><span>{stat.count} {stat.count === 1 ? 'compra' : 'compras'}</span></div>
                    <div className="product-price-metrics">
                      <div><span>Último</span><b>{formatBRL(stat.latest)}</b></div><div><span>Média</span><b>{formatBRL(stat.average)}</b></div><div><span>Menor</span><b>{formatBRL(stat.min)}</b></div><div><span>Maior</span><b>{formatBRL(stat.max)}</b></div>
                    </div>
                    {stat.count > 1 ? <div className={`trend-pill ${stat.variation > 0 ? 'up' : stat.variation < 0 ? 'down' : ''}`}>{formatPercent(stat.variation)} do primeiro para o último registro</div> : <div className="trend-pill">Primeiro ponto do histórico</div>}
                    {stat.placeAverages.length > 1 ? <div className="best-place"><span>Você costuma pagar menos em</span><strong>{stat.placeAverages[0].name}</strong><small>Média: {formatBRL(stat.placeAverages[0].average)}</small></div> : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="premium-card work-card">
              <div className="section-inline-heading"><div><span className="page-kicker">COMPARAÇÃO DE LOCAIS</span><h2>Preço médio por estabelecimento</h2><p>Produtos com histórico em mais de um local aparecem primeiro.</p></div></div>
              <div className="comparison-table">
                {productStats.filter((stat) => stat.placeAverages.length > 0).slice(0, 10).map((stat) => <div className="comparison-row" key={stat.id}><strong>{stat.product.name}</strong><div>{stat.placeAverages.slice(0, 4).map((place, index) => <span key={`${stat.id}-${place.name}`} className={index === 0 && stat.placeAverages.length > 1 ? 'winner' : ''}><em>{place.name}</em><b>{formatBRL(place.average)}</b></span>)}</div></div>)}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
