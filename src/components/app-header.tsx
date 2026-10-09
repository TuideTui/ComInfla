'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
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
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const fallbackTimer = useRef<number | null>(null)

  useEffect(() => {
    setPendingHref(null)
    document.body.classList.remove('app-route-pending')
    if (fallbackTimer.current) {
      window.clearTimeout(fallbackTimer.current)
      fallbackTimer.current = null
    }
  }, [pathname])

  useEffect(() => () => {
    document.body.classList.remove('app-route-pending')
    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current)
  }, [])

  function beginNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === href
    ) return

    setPendingHref(href)
    document.body.classList.add('app-route-pending')

    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current)
    fallbackTimer.current = window.setTimeout(() => {
      setPendingHref(null)
      document.body.classList.remove('app-route-pending')
    }, 5000)
  }

  return (
    <>
      <div className={`app-navigation-progress${pendingHref ? ' is-active' : ''}`} aria-hidden="true"><i /></div>
      <header className="app-header premium-card app-header-persistent">
        <Brand href="/app" className="app-brand" />
        <nav className="app-nav" aria-label="Navegação da plataforma">
          {navItems.map((item) => (
            <Link
              key={item.key}
              className={`${active === item.key ? 'active' : ''}${pendingHref === item.href ? ' pending' : ''}`}
              href={item.href}
              prefetch
              onClick={(event) => beginNavigation(event, item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post">
          <button className="avatar-button" title="Sair da conta" aria-label="Sair da conta">{initial}</button>
        </form>
      </header>
    </>
  )
}
