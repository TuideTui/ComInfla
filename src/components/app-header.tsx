'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Brand } from './brand'

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

function sectionFromPath(pathname: string): ActiveSection {
  if (pathname.startsWith('/app/cadastrando')) return 'cadastrando'
  if (pathname.startsWith('/app/comprando')) return 'comprando'
  if (pathname.startsWith('/app/analises')) return 'analises'
  if (pathname.startsWith('/app/comparar')) return 'comparar'
  if (pathname.startsWith('/app/mapa')) return 'mapa'
  if (pathname.startsWith('/app/fechamento')) return 'fechamento'
  return 'principal'
}

export function AppHeader({ active: activeProp, firstName }: { active?: ActiveSection; firstName: string }) {
  const pathname = usePathname()
  const active = activeProp ?? sectionFromPath(pathname)
  const initial = (firstName || 'U').slice(0, 1).toUpperCase()

  return (
    <header className="app-header premium-card app-header-persistent">
      <Brand href="/app" className="app-brand" />
      <nav className="app-nav" aria-label="Navegação da plataforma">
        {navItems.map((item) => (
          <Link key={item.key} className={active === item.key ? 'active' : ''} href={item.href} prefetch>
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
