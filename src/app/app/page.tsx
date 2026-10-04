import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function monthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: purchases }, { count: productCount }, { count: establishmentCount }, { data: insights }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    (() => {
      const { start, end } = monthBounds()
      return supabase.from('purchases').select('id,total_cents').gte('purchased_at', start).lt('purchased_at', end)
    })(),
    supabase.from('products').select('*', { head: true, count: 'exact' }).is('archived_at', null),
    supabase.from('establishments').select('*', { head: true, count: 'exact' }).is('archived_at', null),
    supabase.from('insight_events').select('id,title,message,severity,created_at').order('created_at', { ascending: false }).limit(3),
  ])

  const monthTotal = purchases?.reduce((sum, item) => sum + Number(item.total_cents ?? 0), 0) ?? 0
  const firstName = profile?.full_name?.split(' ')[0] || 'você'

  return (
    <main className="app-shell">
      <header className="app-header premium-card">
        <Link href="/app" className="brand">ComInfla</Link>
        <nav className="app-nav">
          <Link className="active" href="/app">Principal</Link>
          <span>Comprando</span><span>Análises</span><span>Fechamento</span>
        </nav>
        <form action="/auth/signout" method="post"><button className="avatar-button" title="Sair">{firstName.slice(0, 1).toUpperCase()}</button></form>
      </header>

      <section className="app-content">
        <div className="dashboard-heading">
          <div><h1>Olá, {firstName}.</h1><p>Veja como sua rotina de consumo está evoluindo.</p></div>
          <button className="button button-primary">+ Registrar compra</button>
        </div>

        <div className="metric-grid">
          <article className="premium-card metric-card"><span>INFLAÇÃO PESSOAL</span><strong>—</strong><small>Será calculada com seu histórico</small></article>
          <article className="premium-card metric-card"><span>GASTO NO MÊS</span><strong>{formatBRL(monthTotal)}</strong><small>{purchases?.length ?? 0} compras registradas</small></article>
          <article className="premium-card metric-card"><span>PRODUTOS MONITORADOS</span><strong>{productCount ?? 0}</strong><small>Itens ativos no seu catálogo</small></article>
          <article className="premium-card metric-card"><span>LOCAIS CADASTRADOS</span><strong>{establishmentCount ?? 0}</strong><small>Estabelecimentos da sua rotina</small></article>
        </div>

        <div className="dashboard-grid">
          <section className="premium-card chart-card">
            <div><h2>Seu histórico começa aqui</h2><p>Depois das primeiras compras, esta área mostrará evolução de preços e inflação pessoal.</p></div>
            <div className="empty-chart"><span /><span /><span /><span /><span /><span /><span /><span /></div>
          </section>
          <section className="premium-card insights-card">
            <h2>Insights recentes</h2>
            {insights?.length ? (
              <div className="insight-list">{insights.map((item) => <article key={item.id} className={`insight-item ${item.severity}`}><strong>{item.title}</strong><p>{item.message}</p></article>)}</div>
            ) : (
              <div className="empty-state"><strong>Nenhum insight ainda</strong><p>Registre compras para o ComInfla começar a identificar padrões.</p></div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
