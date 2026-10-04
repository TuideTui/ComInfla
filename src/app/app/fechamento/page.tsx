import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { createClient } from '@/lib/supabase/server'
import { formatBRL, formatMonth, formatPercent, productLabel } from '@/lib/format'

function inRange(value: string, start: Date, end: Date) {
  const time = new Date(value).getTime()
  return time >= start.getTime() && time < end.getTime()
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export default async function ClosingPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: rawPurchases }, { data: rawItems }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('purchases').select('id,purchased_at,total_cents,establishment_id,establishment_name_snapshot,establishment:establishments(id,name)').order('purchased_at'),
    supabase.from('purchase_items').select('id,product_id,unit_price_cents,total_cents,quantity,purchase_id,product:products(id,name,brand,presentation,base_quantity,unit,packaging),purchase:purchases(id,purchased_at,establishment_id,establishment_name_snapshot,establishment:establishments(id,name))').order('created_at'),
  ])

  const purchases = (rawPurchases ?? []) as any[]
  const items = (rawItems ?? []) as any[]
  const now = new Date()
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const yearAgoStart = new Date(monthStart.getFullYear() - 1, monthStart.getMonth(), 1)
  const yearAgoEnd = new Date(monthEnd.getFullYear() - 1, monthEnd.getMonth(), 1)

  const currentPurchases = purchases.filter((purchase) => inRange(purchase.purchased_at, monthStart, monthEnd))
  const previousPurchases = purchases.filter((purchase) => inRange(purchase.purchased_at, previousStart, monthStart))
  const yearAgoPurchases = purchases.filter((purchase) => inRange(purchase.purchased_at, yearAgoStart, yearAgoEnd))
  const currentItems = items.filter((item) => inRange(item.purchase?.purchased_at, monthStart, monthEnd))
  const previousItems = items.filter((item) => inRange(item.purchase?.purchased_at, previousStart, monthStart))

  const total = currentPurchases.reduce((sum, purchase) => sum + Number(purchase.total_cents ?? 0), 0)
  const previousTotal = previousPurchases.reduce((sum, purchase) => sum + Number(purchase.total_cents ?? 0), 0)
  const yearAgoTotal = yearAgoPurchases.reduce((sum, purchase) => sum + Number(purchase.total_cents ?? 0), 0)
  const monthChange = previousTotal ? ((total / previousTotal) - 1) * 100 : null
  const yearChange = yearAgoTotal ? ((total / yearAgoTotal) - 1) * 100 : null
  const ticket = currentPurchases.length ? total / currentPurchases.length : 0
  const distinctProducts = new Set(currentItems.map((item) => item.product_id)).size
  const distinctPlaces = new Set(currentPurchases.map((purchase) => purchase.establishment_id).filter(Boolean)).size

  const placeGroups = new Map<string, { name: string; count: number; total: number }>()
  for (const purchase of currentPurchases) {
    const name = purchase.establishment?.name ?? purchase.establishment_name_snapshot ?? 'Local não identificado'
    const key = purchase.establishment_id ?? name
    const group = placeGroups.get(key) ?? { name, count: 0, total: 0 }
    group.count += 1
    group.total += Number(purchase.total_cents ?? 0)
    placeGroups.set(key, group)
  }
  const topByCount = [...placeGroups.values()].sort((a, b) => b.count - a.count)[0]
  const topBySpend = [...placeGroups.values()].sort((a, b) => b.total - a.total)[0]
  const expensivePurchase = [...currentPurchases].sort((a, b) => Number(b.total_cents) - Number(a.total_cents))[0]
  const expensiveItem = [...currentItems].sort((a, b) => Number(b.unit_price_cents) - Number(a.unit_price_cents))[0]

  const currentByProduct = new Map<string, any[]>()
  const previousByProduct = new Map<string, any[]>()
  for (const item of currentItems) currentByProduct.set(item.product_id, [...(currentByProduct.get(item.product_id) ?? []), item])
  for (const item of previousItems) previousByProduct.set(item.product_id, [...(previousByProduct.get(item.product_id) ?? []), item])

  const variations = [...currentByProduct.entries()].flatMap(([productId, rows]) => {
    const before = previousByProduct.get(productId) ?? []
    if (!before.length) return []
    const currentAvg = average(rows.map((row) => Number(row.unit_price_cents)))
    const previousAvg = average(before.map((row) => Number(row.unit_price_cents)))
    if (!previousAvg) return []
    return [{ product: rows[0].product, pct: ((currentAvg / previousAvg) - 1) * 100, currentAvg, previousAvg }]
  }).sort((a, b) => b.pct - a.pct)
  const biggestIncrease = variations.find((item) => item.pct > 0)
  const biggestDrop = [...variations].reverse().find((item) => item.pct < 0)

  const bestCandidates = currentItems.flatMap((item) => {
    const previousHistory = items.filter((other) => other.product_id === item.product_id && new Date(other.purchase?.purchased_at).getTime() < monthStart.getTime())
    if (!previousHistory.length) return []
    const historicAvg = average(previousHistory.map((row) => Number(row.unit_price_cents)))
    if (!historicAvg) return []
    return [{ item, pct: ((Number(item.unit_price_cents) / historicAvg) - 1) * 100, historicAvg }]
  }).sort((a, b) => a.pct - b.pct)
  const bestPurchase = bestCandidates[0]?.pct < 0 ? bestCandidates[0] : null
  const firstName = profile?.full_name?.split(' ')[0] || 'você'

  return (
    <main className="app-shell">
      <AppHeader active="fechamento" firstName={firstName} />
      <section className="app-content">
        <div className="dashboard-heading closing-heading">
          <div><span className="page-kicker">MÊS ENCERRADO</span><h1>Fechamento · {formatMonth(monthStart)}</h1><p>Um resumo interpretativo do que aconteceu com seu consumo no último mês completo.</p></div>
        </div>

        {!currentPurchases.length ? (
          <section className="premium-card work-card empty-analytics"><span className="page-kicker">AGUARDANDO HISTÓRICO</span><h2>Ainda não há compras em {formatMonth(monthStart)}</h2><p>O fechamento usa sempre o último mês encerrado. Quando houver registros nesse período, esta página monta automaticamente o relatório.</p></section>
        ) : (
          <>
            <div className="closing-summary-grid">
              <article className="premium-card closing-hero-card"><span>Total gasto</span><strong>{formatBRL(total)}</strong><small>{currentPurchases.length} compras · ticket médio {formatBRL(ticket)}</small></article>
              <article className="premium-card closing-change-card"><span>Vs. mês anterior</span><strong className={monthChange !== null && monthChange > 0 ? 'warm' : 'cool'}>{formatPercent(monthChange)}</strong><small>{previousPurchases.length ? `Mês anterior: ${formatBRL(previousTotal)}` : 'Sem base no mês anterior'}</small></article>
              <article className="premium-card closing-change-card"><span>Vs. mesmo mês do ano anterior</span><strong>{formatPercent(yearChange)}</strong><small>{yearAgoPurchases.length ? `Ano anterior: ${formatBRL(yearAgoTotal)}` : 'Ainda sem histórico anual comparável'}</small></article>
            </div>

            <div className="closing-facts">
              <div><strong>{distinctProducts}</strong><span>produtos diferentes</span></div><div><strong>{distinctPlaces}</strong><span>estabelecimentos visitados</span></div><div><strong>{currentItems.length}</strong><span>itens registrados</span></div>
            </div>

            <section className="closing-insight-grid">
              <article className="premium-card closing-insight featured"><span className="insight-label">MAIOR AUMENTO</span>{biggestIncrease ? <><h3>{productLabel(biggestIncrease.product)}</h3><strong>{formatPercent(biggestIncrease.pct)}</strong><p>A média passou de {formatBRL(biggestIncrease.previousAvg)} para {formatBRL(biggestIncrease.currentAvg)}.</p></> : <><h3>Sem comparação suficiente</h3><p>Precisamos do mesmo produto também no mês anterior.</p></>}</article>
              <article className="premium-card closing-insight"><span className="insight-label">MELHOR COMPRA</span>{bestPurchase ? <><h3>{productLabel(bestPurchase.item.product)}</h3><strong className="cool">{formatPercent(bestPurchase.pct)}</strong><p>{formatBRL(bestPurchase.item.unit_price_cents)} frente à sua média histórica de {formatBRL(bestPurchase.historicAvg)}.</p></> : <><h3>Histórico ainda curto</h3><p>A melhor compra aparecerá quando houver preços anteriores comparáveis.</p></>}</article>
              <article className="premium-card closing-insight"><span className="insight-label">COMPRA MAIS CARA</span>{expensivePurchase ? <><h3>{expensivePurchase.establishment?.name ?? expensivePurchase.establishment_name_snapshot}</h3><strong>{formatBRL(expensivePurchase.total_cents)}</strong><p>Maior total em uma única compra no mês.</p></> : null}</article>
              <article className="premium-card closing-insight"><span className="insight-label">PRODUTO UNITÁRIO MAIS CARO</span>{expensiveItem ? <><h3>{productLabel(expensiveItem.product)}</h3><strong>{formatBRL(expensiveItem.unit_price_cents)}</strong><p>Maior preço unitário registrado no mês.</p></> : null}</article>
              <article className="premium-card closing-insight"><span className="insight-label">LOCAL MAIS UTILIZADO</span>{topByCount ? <><h3>{topByCount.name}</h3><strong>{topByCount.count} compras</strong><p>Foi o estabelecimento mais recorrente do mês.</p></> : null}</article>
              <article className="premium-card closing-insight"><span className="insight-label">MAIOR GASTO POR LOCAL</span>{topBySpend ? <><h3>{topBySpend.name}</h3><strong>{formatBRL(topBySpend.total)}</strong><p>Maior gasto acumulado entre os estabelecimentos.</p></> : null}</article>
              <article className="premium-card closing-insight"><span className="insight-label">MAIOR QUEDA</span>{biggestDrop ? <><h3>{productLabel(biggestDrop.product)}</h3><strong className="cool">{formatPercent(biggestDrop.pct)}</strong><p>Foi a maior redução média frente ao mês anterior.</p></> : <><h3>Nenhuma queda comparável</h3><p>Este indicador aparecerá quando houver variações negativas entre meses.</p></>}</article>
              <article className="premium-card closing-insight future"><span className="insight-label">ECONOMIA POTENCIAL</span><h3>Em preparação</h3><p>A próxima fase cruzará seus preços com estabelecimentos frequentes para estimar quanto poderia ter economizado sem sugerir locais irreais.</p></article>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
