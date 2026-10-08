import Link from 'next/link'
import { Brand } from '../components/brand'

const bars = [24, 31, 38, 47, 56, 66, 76, 88]

const productAreas = [
  {
    code: '01',
    title: 'Cadastrando',
    text: 'Monte seu catálogo de produtos e os estabelecimentos que fazem parte da sua rotina.',
    detail: 'Produtos · locais · fotos · mapa',
  },
  {
    code: '02',
    title: 'Comprando',
    text: 'Registre uma compra completa, com vários itens, quantidade, preço, desconto e contexto.',
    detail: 'Histórico · preço pago · promoção',
  },
  {
    code: '03',
    title: 'Análises',
    text: 'Entenda gastos, categorias, preços médios, mínimos, máximos e padrões do seu consumo.',
    detail: 'Gráficos · tendências · insights',
  },
  {
    code: '04',
    title: 'Comparar',
    text: 'Coloque períodos lado a lado e descubra quanto os mesmos produtos ficaram mais caros.',
    detail: 'Anos · cesta equivalente · inflação',
  },
  {
    code: '05',
    title: 'Mapa',
    text: 'Visualize onde seu consumo acontece e quanto cada estabelecimento representa na sua rotina.',
    detail: 'Localização · gastos · frequência',
  },
  {
    code: '06',
    title: 'Fechamento',
    text: 'Reveja cada mês encerrado com indicadores, destaques, comparações e oportunidades de economia.',
    detail: 'Mês a mês · histórico · resumo',
  },
]

const insightExamples = [
  'Você pagou 32% acima do seu preço médio por este produto.',
  'Este é o menor preço que você já pagou pela Coca-Cola.',
  'O Mercado A costuma ser 11% mais barato para sua cesta.',
]

export default function HomePage() {
  return (
    <main className="landing-shell landing-v2">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="site-header container landing-header">
        <Brand href="/" className="landing-brand" />
        <nav className="landing-nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#plataforma">Plataforma</a>
          <a href="#insights">Insights</a>
          <a href="#seguranca">Segurança</a>
        </nav>
        <div className="landing-header-actions">
          <Link href="/login" className="text-link landing-login-link">Entrar</Link>
          <Link href="/signup" className="button button-outline button-small">Criar conta</Link>
        </div>
      </header>

      <section className="hero container landing-hero">
        <div className="hero-copy reveal">
          <span className="eyebrow">INTELIGÊNCIA SOBRE A SUA ROTINA</span>
          <h1>Descubra quanto ficou mais caro viver a sua rotina.</h1>
          <p>
            Registre preços reais do seu dia a dia, acompanhe os lugares que você frequenta e transforme
            compras comuns em uma visão clara sobre inflação, economia e evolução do seu custo de vida.
          </p>
          <div className="hero-actions">
            <Link href="/signup" className="button button-primary">Começar agora</Link>
            <a href="#como-funciona" className="text-link">Conhecer o ComInfla →</a>
          </div>
          <div className="hero-proof-row" aria-label="Principais capacidades do ComInfla">
            <span>Histórico de preços</span>
            <span>Comparação entre locais</span>
            <span>Fechamento mensal</span>
          </div>
        </div>

        <div className="hero-visual reveal reveal-delay">
          <div className="premium-card hero-card landing-hero-card">
            <div className="hero-card-topline">
              <span className="card-kicker">Exemplo de visualização</span>
              <span className="live-dot">ComInfla</span>
            </div>
            <strong className="hero-number">+8,7%</strong>
            <span className="muted">Inflação pessoal · últimos 12 meses</span>
            <div className="bar-chart" aria-label="Exemplo visual de evolução da inflação">
              {bars.map((height, index) => (
                <span key={height + index} style={{ height: `${height}%` }} className={index === bars.length - 1 ? 'active' : ''} />
              ))}
            </div>
            <div className="hero-card-insight">
              <span>Insight</span>
              <strong>Seu custo de vida subiu acima do padrão da sua cesta.</strong>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="section container landing-section">
        <div className="section-heading centered-heading">
          <span className="eyebrow">DO REGISTRO AO INSIGHT</span>
          <h2>Transforme compras comuns em inteligência sobre seu custo de vida.</h2>
          <p>O ComInfla organiza sua rotina em três etapas simples para que o histórico trabalhe a seu favor.</p>
        </div>
        <div className="feature-grid landing-feature-grid" id="recursos">
          <article className="premium-card feature-card landing-feature-card">
            <span>01</span>
            <div className="feature-illustration feature-register" aria-hidden="true"><i /><i /><i /></div>
            <h3>Registre</h3>
            <p>Cadastre produtos, preços e estabelecimentos que realmente fazem parte da sua rotina.</p>
          </article>
          <article className="premium-card feature-card landing-feature-card">
            <span>02</span>
            <div className="feature-illustration feature-compare" aria-hidden="true"><i /><i /><i /></div>
            <h3>Compare</h3>
            <p>Veja onde costuma pagar menos, quando um preço saiu do padrão e como ele mudou no tempo.</p>
          </article>
          <article className="premium-card feature-card landing-feature-card">
            <span>03</span>
            <div className="feature-illustration feature-understand" aria-hidden="true"><i /><i /><i /></div>
            <h3>Entenda</h3>
            <p>Acompanhe inflação, tendências, fechamento mensal e oportunidades reais de economia.</p>
          </article>
        </div>
      </section>

      <section className="container landing-story-banner" aria-label="Diferencial do ComInfla">
        <div className="story-banner-copy">
          <span className="eyebrow eyebrow-solid">SEU CUSTO DE VIDA É PESSOAL</span>
          <h2>O preço muda. O contexto também.</h2>
          <p>
            O ComInfla não olha apenas para quanto você gastou. Ele relaciona produto, preço, lugar e tempo
            para mostrar o que realmente mudou na sua rotina.
          </p>
          <Link href="/signup" className="button button-primary">Criar meu histórico</Link>
        </div>
        <div className="story-visual" aria-hidden="true">
          <div className="story-price-card story-price-old"><span>Antes</span><strong>R$ 3,79</strong></div>
          <div className="story-price-line"><span>+13,2%</span></div>
          <div className="story-price-card story-price-new"><span>Agora</span><strong>R$ 4,29</strong></div>
          <div className="story-bars"><i /><i /><i /><i /><i /></div>
        </div>
      </section>

      <section id="plataforma" className="section container landing-section platform-section">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">UMA PLATAFORMA PARA A ROTINA INTEIRA</span>
            <h2>Do cadastro ao fechamento do mês, tudo conversa entre si.</h2>
          </div>
          <p>Cada parte do ComInfla alimenta a próxima. Quanto mais histórico você constrói, mais úteis ficam as comparações.</p>
        </div>
        <div className="platform-grid">
          {productAreas.map((area) => (
            <article key={area.title} className="premium-card platform-card">
              <div className="platform-card-head"><span>{area.code}</span><b>→</b></div>
              <h3>{area.title}</h3>
              <p>{area.text}</p>
              <small>{area.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="container video-showcase-section">
        <div className="video-preview-card premium-card">
          <div className="video-preview-screen">
            <div className="video-browser-bar"><i /><i /><i /><span>cominfla.vercel.app</span></div>
            <div className="video-preview-content">
              <span className="video-play" aria-hidden="true">▶</span>
              <strong>Demonstração do ComInfla</strong>
              <small>Vídeo de apresentação · em breve</small>
            </div>
          </div>
        </div>
        <div className="video-copy">
          <span className="eyebrow">VEJA A IDEIA EM AÇÃO</span>
          <h2>Uma rotina simples de registrar. Uma história poderosa para analisar.</h2>
          <p>
            Este espaço já está preparado para receber um vídeo curto da plataforma no futuro — incorporado diretamente
            na landing, sem tirar o usuário do ComInfla.
          </p>
          <div className="video-points">
            <span>01 <b>Cadastre sua base</b></span>
            <span>02 <b>Registre suas compras</b></span>
            <span>03 <b>Deixe o histórico revelar padrões</b></span>
          </div>
        </div>
      </section>

      <section id="insights" className="section container landing-section insights-showcase">
        <div className="section-heading centered-heading narrow-heading">
          <span className="eyebrow">O COMINFLA NÃO ENTREGA SÓ GRÁFICOS</span>
          <h2>Ele transforma histórico em frases que fazem sentido.</h2>
          <p>Insights aparecem no momento da compra e continuam disponíveis no seu histórico.</p>
        </div>
        <div className="insight-quote-grid">
          {insightExamples.map((text, index) => (
            <article className="premium-card insight-quote-card" key={text}>
              <div className="insight-quote-icon">{index === 0 ? '↑' : index === 1 ? '↓' : '◎'}</div>
              <p>“{text}”</p>
              <span>{index === 0 ? 'Comparação histórica' : index === 1 ? 'Novo menor preço' : 'Comparação de estabelecimentos'}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="seguranca" className="security-band landing-security-band">
        <div className="container security-content landing-security-content">
          <div>
            <span className="eyebrow">PRIVACIDADE DESDE O INÍCIO</span>
            <h2>Seus dados de consumo pertencem a você.</h2>
            <p>O ComInfla foi estruturado para manter cada usuário isolado dos demais, com autenticação e regras no próprio banco de dados.</p>
          </div>
          <div className="security-list">
            <article><span>01</span><div><strong>Autenticação protegida</strong><p>Seu acesso é controlado pelo Supabase Auth.</p></div></article>
            <article><span>02</span><div><strong>Dados separados por usuário</strong><p>Políticas RLS limitam o acesso aos próprios registros.</p></div></article>
            <article><span>03</span><div><strong>Imagens privadas</strong><p>Fotos de produtos e locais não precisam ficar públicas.</p></div></article>
          </div>
        </div>
      </section>

      <section className="container final-cta-section">
        <div className="final-cta-card">
          <span className="eyebrow eyebrow-solid">COMECE PELO PRIMEIRO PREÇO</span>
          <h2>Seu histórico de amanhã começa com uma compra registrada hoje.</h2>
          <p>Crie sua conta, cadastre os lugares que fazem parte da sua rotina e deixe o ComInfla construir contexto com você.</p>
          <div className="final-cta-actions">
            <Link href="/signup" className="button button-primary">Começar agora</Link>
            <Link href="/login" className="button button-outline">Já tenho uma conta</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="container landing-footer-inner">
          <Brand href="/" className="landing-footer-brand" />
          <p>ComInfla · Inteligência sobre o seu custo de vida.</p>
          <a href="#top" className="text-link">Voltar ao topo ↑</a>
        </div>
      </footer>
    </main>
  )
}
