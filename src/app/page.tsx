import Link from 'next/link'

const bars = [28, 36, 44, 52, 61, 70, 78, 88]

export default function HomePage() {
  return (
    <main className="landing-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="site-header container">
        <Link href="/" className="brand">ComInfla</Link>
        <nav className="landing-nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#seguranca">Segurança</a>
        </nav>
        <Link href="/login" className="button button-outline button-small">Entrar</Link>
      </header>

      <section className="hero container">
        <div className="hero-copy reveal">
          <span className="eyebrow">INFLAÇÃO PESSOAL</span>
          <h1>Descubra quanto ficou mais caro viver a sua rotina.</h1>
          <p>
            Registre preços reais do seu dia a dia, compare os lugares que você frequenta e entenda
            como o seu próprio custo de vida evolui ao longo do tempo.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="button button-primary">Começar agora</Link>
            <a href="#como-funciona" className="text-link">Conhecer o ComInfla →</a>
          </div>
          <div className="mini-stats">
            <div><strong>42</strong><span>produtos monitorados</span></div>
            <div><strong>9</strong><span>locais frequentes</span></div>
            <div><strong>R$ 73</strong><span>economia potencial</span></div>
          </div>
        </div>

        <div className="hero-visual reveal reveal-delay">
          <div className="premium-card hero-card">
            <span className="card-kicker">Seu custo de vida</span>
            <strong className="hero-number">+8,7%</strong>
            <span className="muted">Inflação pessoal · últimos 12 meses</span>
            <div className="bar-chart" aria-label="Exemplo visual de evolução da inflação">
              {bars.map((height, index) => (
                <span key={height + index} style={{ height: `${height}%` }} className={index === bars.length - 1 ? 'active' : ''} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="section container">
        <div className="section-heading">
          <span className="eyebrow">DO REGISTRO AO INSIGHT</span>
          <h2>Transforme compras comuns em inteligência sobre seu custo de vida.</h2>
        </div>
        <div className="feature-grid" id="recursos">
          <article className="premium-card feature-card"><span>01</span><h3>Registre</h3><p>Cadastre produtos, preços e os estabelecimentos que fazem parte da sua rotina.</p></article>
          <article className="premium-card feature-card"><span>02</span><h3>Compare</h3><p>Veja onde costuma pagar menos, quando um preço saiu do padrão e como ele mudou no tempo.</p></article>
          <article className="premium-card feature-card"><span>03</span><h3>Entenda</h3><p>Acompanhe inflação pessoal, tendências, fechamento mensal e oportunidades reais de economia.</p></article>
        </div>
      </section>

      <section id="seguranca" className="security-band">
        <div className="container security-content">
          <div><span className="eyebrow">PRIVACIDADE DESDE O INÍCIO</span><h2>Seus dados de consumo pertencem a você.</h2></div>
          <p>As informações privadas são protegidas por autenticação e políticas de acesso no próprio banco de dados.</p>
        </div>
      </section>
    </main>
  )
}
