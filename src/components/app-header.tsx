import Link from 'next/link'

type ActiveSection = 'principal' | 'cadastrando' | 'comprando' | 'analises' | 'comparar' | 'mapa' | 'fechamento'

const navItems: Array<{ key: ActiveSection; label: string; href: string }> = [
  { key: 'principal', label: 'Principal', href: '/app' },
  { key: 'cadastrando', label: 'Cadastrando', href: '/app/cadastrando' },
  { key: 'comprando', label: 'Comprando', href: '/app/comprando' },
  { key: 'analises', label: 'Análises', href: '/app/analises' },
  { key: 'comparar', label: 'Comparar', href: '/app/comparar' },
  { key: 'mapa', label: 'Mapa', href: '/app/mapa' },
  { key: 'fechamento', label: 'Fechamento', href: '/app/fechamento' },
]

export function AppHeader({ active, firstName }: { active: ActiveSection; firstName: string }) {
  const initial = (firstName || 'U').slice(0, 1).toUpperCase()

  return (
    <header className="app-header premium-card">
      <Link href="/app" className="brand">ComInfla</Link>
      <nav className="app-nav" aria-label="Navegação da plataforma">
        {navItems.map((item) => (
          <Link key={item.key} className={active === item.key ? 'active' : ''} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <form action="/auth/signout" method="post">
        <button className="avatar-button" title="Sair da conta" aria-label="Sair da conta">{initial}</button>
      </form>
    </header>
  )
}
