import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { formatBRL, formatDateTime } from '@/lib/format'

function monthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const eightMonthsAgo = new Date()
  eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 7, 1)
  eightMonthsAgo.setHours(0, 0, 0, 0)

  const [{ data: profile }, { data: allPurchases }, { count: productCount }, { count: establishmentCount }, { data: insights }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('purchases').select('id,total_cents,purchased_at,establishment_id,establishment_name_snapshot,establishment:establishments(id,name)').gte('purchased_at', eightMonthsAgo.toISOString()).order('purchased_at', { ascending: false }),
    supabase.from('products').select('*', { head: true, count: 'exact' }).is('archived_at', null),
    supabase.from('establishments').select('*', { head: true, count: 'exact' }).is('archived_at', null),
    supabase.from('insight_events').select('id,title,message,severity,created_at').order('created_at', { ascending: false }).limit(4),
  ])

  const { start, end } = monthBounds()
  const currentPurchases = (allPurchases ?? []).filter((item) => {
    const time = new Date(item.purchased_at).getTime()
    return time >= start.getTime() && time < end.getTime()
  })
  const monthTotal = currentPurchases.reduce((sum, item) => sum + Number(item.total_cents ?? 0), 0)
  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const lastPurchase = allPurchases?.[0]

  const placeCounts = new Map<string, { name: string; count: number }>()
  for (const purchase of currentPurchases) {
    const name = (purchase.establishment as any)?.name ?? purchase.establishment_name_snapshot ?? 'Local não identificado'
    const key = purchase.establishment_id ?? name
    const item = placeCounts.get(key) ?? { name, count: 0 }
    item.count += 1
    placeCounts.set(key, item)
  }
  const favoritePlace = [...placeCounts.values()].sort((a, b) => b.count - a.count)[0]

  const monthly = new Map<string, { label: string; total: number }>()
  for (const purchase of [...(allPurchases ?? [])].reverse()) {
    const date = new Date(purchase.purchased_at)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')
    const item = monthly.get(key) ?? { label, total: 0 }
    item.total += Number(purchase.total_cents ?? 0)
    monthly.set(key, item)
  }
  const bars = [...monthly.values()].slice(-8)
  const maxBar = Math.max(1, ...bars.map((item) => item.total))

  return (
    <main className="app-shell">
      <AppHeader active="principal" firstName={firstName} />

      <section className="app-content">
        <div className="dashboard-heading">
          <div><h1>Olá, {firstName}.</h1><p>Veja como sua rotina de consumo está evoluindo.</p></div>
          <Link href="/app/comprando#registrar-compra" className="button button-primary">+ Registrar compra</Link>
        </div>

        <div className="metric-grid">
          <article className="premium-card metric-card"><span>INFLAÇÃO PESSOAL</span><strong>—</strong><small>Será liberada quando houver base histórica suficiente</small></article>
          <article className="premium-card metric-card"><span>GASTO NO MÊS</span><strong>{formatBRL(monthTotal)}</strong><small>{currentPurchases.length} compras registradas</small></article>
          <article className="premium-card metric-card"><span>PRODUTOS MONITORADOS</span><strong>{productCount ?? 0}</strong><small>Itens ativos no seu catálogo</small></article>
          <article className="premium-card metric-card"><span>LOCAIS CADASTRADOS</span><strong>{establishmentCount ?? 0}</strong><small>Estabelecimentos da sua rotina</small></article>
        </div>

        <div className="quick-context-grid">
          <article className="premium-card context-card"><span>ÚLTIMA COMPRA</span>{lastPurchase ? <><strong>{formatBRL(lastPurchase.total_cents)}</strong><small>{(lastPurchase.establishment as any)?.name ?? lastPurchase.establishment_name_snapshot} · {formatDateTime(lastPurchase.purchased_at)}</small></> : <><strong>—</strong><small>Seu primeiro registro aparecerá aqui</small></>}</article>
          <article className="premium-card context-card"><span>LOCAL MAIS VISITADO NO MÊS</span><strong>{favoritePlace?.name ?? '—'}</strong><small>{favoritePlace ? `${favoritePlace.count} compras no mês` : 'Aguardando compras no período'}</small></article>
          <article className="premium-card context-card"><span>ECONOMIA POTENCIAL</span><strong>—</strong><small>Entrará na segunda fase com comparação entre locais frequentes</small></article>
        </div>

        <div className="dashboard-grid">
          <section className="premium-card chart-card">
            <div><h2>{bars.length ? 'Gastos dos últimos meses' : 'Seu histórico começa aqui'}</h2><p>{bars.length ? 'Acompanhe quanto da sua rotina já foi registrada no ComInfla.' : 'Depois das primeiras compras, esta área mostrará evolução de gastos e inflação pessoal.'}</p></div>
            {bars.length ? <div className="dashboard-monthly-chart">{bars.map((bar, index) => <div key={`${bar.label}-${index}`}><span>{formatBRL(bar.total)}</span><i style={{ height: `${Math.max(8, (bar.total / maxBar) * 100)}%` }} className={index === bars.length - 1 ? 'active' : ''} /><small>{bar.label}</small></div>)}</div> : <div className="empty-chart"><span /><span /><span /><span /><span /><span /><span /><span /></div>}
          </section>
          <section className="premium-card insights-card">
            <div className="section-inline-heading"><div><h2>Insights recentes</h2></div>{insights?.length ? <Link href="/app/analises" className="text-link small">Ver análises →</Link> : null}</div>
            {insights?.length ? (
              <div className="insight-list">{insights.map((item) => <article key={item.id} className={`insight-item ${item.severity}`}><strong>{item.title}</strong><p>{item.message}</p></article>)}</div>
            ) : (
              <div className="empty-state"><strong>Nenhum insight ainda</strong><p>Registre compras para o ComInfla começar a identificar padrões.</p><Link href="/app/comprando" className="text-link small">Ir para Comprando →</Link></div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
