'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
  const router = useRouter()
  const active = activeProp ?? sectionFromPath(pathname)
  const initial = (firstName || 'U').slice(0, 1).toUpperCase()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const navigationTimer = useRef<number | null>(null)
  const safetyTimer = useRef<number | null>(null)

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href))
  }, [router])

  useEffect(() => {
    setPendingHref(null)
    document.body.classList.remove('app-route-leaving')
    document.body.classList.add('app-route-arrived')

    const arrivedTimer = window.setTimeout(() => {
      document.body.classList.remove('app-route-arrived')
    }, 650)

    if (navigationTimer.current) {
      window.clearTimeout(navigationTimer.current)
      navigationTimer.current = null
    }
    if (safetyTimer.current) {
      window.clearTimeout(safetyTimer.current)
      safetyTimer.current = null
    }

    return () => window.clearTimeout(arrivedTimer)
  }, [pathname])

  useEffect(() => () => {
    document.body.classList.remove('app-route-leaving', 'app-route-arrived')
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current)
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current)
  }, [])

  function beginNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathname === href ||
      pendingHref
    ) return

    event.preventDefault()
    setPendingHref(href)
    document.body.classList.remove('app-route-arrived')
    document.body.classList.add('app-route-leaving')

    // A rota já foi prefetched. Este pequeno intervalo existe para a tela atual
    // realmente concluir a animação de saída antes da troca visual.
    navigationTimer.current = window.setTimeout(() => {
      router.push(href)
    }, 260)

    safetyTimer.current = window.setTimeout(() => {
      setPendingHref(null)
      document.body.classList.remove('app-route-leaving')
    }, 5000)
  }

  return (
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
  )
}
