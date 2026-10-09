import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatBRL, formatDateTime } from '@/lib/format'

function currentSaoPauloMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  return `${year}-${month}-01`
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' })
    .format(new Date(`${value}T12:00:00`))
    .replace('.', '')
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const currentMonth = currentSaoPauloMonth()

  const [
    { data: profile },
    { data: monthlyRows },
    { data: favoriteRows },
    { data: lastPurchases },
    { count: productCount },
    { count: establishmentCount },
    { data: insights },
  ] = await Promise.all([
    supabase.from('profiles').select('full_name').single(),
    supabase.from('monthly_purchase_stats').select('month_start,purchase_count,total_cents').order('month_start', { ascending: false }).limit(8),
    supabase.from('monthly_establishment_stats').select('establishment_id,establishment_name,purchase_count,total_cents').eq('month_start', currentMonth).order('purchase_count', { ascending: false }).limit(1),
    supabase.from('purchases').select('id,total_cents,purchased_at,establishment_name_snapshot,establishment:establishments(id,name)').order('purchased_at', { ascending: false }).limit(1),
    supabase.from('products').select('*', { head: true, count: 'exact' }).is('archived_at', null),
    supabase.from('establishments').select('*', { head: true, count: 'exact' }).is('archived_at', null),
    supabase.from('insight_events').select('id,title,message,severity,created_at').order('created_at', { ascending: false }).limit(4),
  ])

  const monthly = [...(monthlyRows ?? [])].reverse()
  const currentStats = (monthlyRows ?? []).find((item) => item.month_start === currentMonth)
  const monthTotal = Number(currentStats?.total_cents ?? 0)
  const monthPurchaseCount = Number(currentStats?.purchase_count ?? 0)
  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const lastPurchase = lastPurchases?.[0]
  const favoritePlace = favoriteRows?.[0]
  const maxBar = Math.max(1, ...monthly.map((item) => Number(item.total_cents ?? 0)))

  return (
    <main className="app-shell">
      <section className="app-content">
        <div className="dashboard-heading">
          <div><h1>Olá, {firstName}.</h1><p>Veja como sua rotina de consumo está evoluindo.</p></div>
          <Link href="/app/comprando#registrar-compra" className="button button-primary">+ Registrar compra</Link>
        </div>

        <div className="metric-grid">
          <article className="premium-card metric-card"><span>INFLAÇÃO PESSOAL</span><strong>—</strong><small>Será liberada quando houver base histórica suficiente</small></article>
          <article className="premium-card metric-card"><span>GASTO NO MÊS</span><strong>{formatBRL(monthTotal)}</strong><small>{monthPurchaseCount} compras registradas</small></article>
          <article className="premium-card metric-card"><span>PRODUTOS MONITORADOS</span><strong>{productCount ?? 0}</strong><small>Itens ativos no seu catálogo</small></article>
          <article className="premium-card metric-card"><span>LOCAIS CADASTRADOS</span><strong>{establishmentCount ?? 0}</strong><small>Estabelecimentos da sua rotina</small></article>
        </div>

        <div className="quick-context-grid">
          <article className="premium-card context-card"><span>ÚLTIMA COMPRA</span>{lastPurchase ? <><strong>{formatBRL(lastPurchase.total_cents)}</strong><small>{(lastPurchase.establishment as any)?.name ?? lastPurchase.establishment_name_snapshot} · {formatDateTime(lastPurchase.purchased_at)}</small></> : <><strong>—</strong><small>Seu primeiro registro aparecerá aqui</small></>}</article>
          <article className="premium-card context-card"><span>LOCAL MAIS VISITADO NO MÊS</span><strong>{favoritePlace?.establishment_name ?? '—'}</strong><small>{favoritePlace ? `${Number(favoritePlace.purchase_count)} compras no mês` : 'Aguardando compras no período'}</small></article>
          <article className="premium-card context-card"><span>ECONOMIA POTENCIAL</span><strong>—</strong><small>Entrará na segunda fase com comparação entre locais frequentes</small></article>
        </div>

        <div className="dashboard-grid">
          <section className="premium-card chart-card">
            <div><h2>{monthly.length ? 'Gastos dos últimos meses' : 'Seu histórico começa aqui'}</h2><p>{monthly.length ? 'Acompanhe quanto da sua rotina já foi registrada no ComInfla.' : 'Depois das primeiras compras, esta área mostrará evolução de gastos e inflação pessoal.'}</p></div>
            {monthly.length ? <div className="dashboard-monthly-chart">{monthly.map((bar, index) => { const total = Number(bar.total_cents ?? 0); return <div key={bar.month_start}><span>{formatBRL(total)}</span><i style={{ height: `${Math.max(8, (total / maxBar) * 100)}%` }} className={index === monthly.length - 1 ? 'active' : ''} /><small>{monthLabel(bar.month_start)}</small></div> })}</div> : <div className="empty-chart"><span /><span /><span /><span /><span /><span /><span /><span /></div>}
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
