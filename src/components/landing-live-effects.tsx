'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const inflationValues = ['+8,7%', '+2,1%', '+5,8%', '+0,5%', '+11,3%', '+3,4%']

const insightMessages = [
  'Seu custo de vida subiu acima do padrão da sua cesta.',
  'Você pagou abaixo da sua média histórica neste produto.',
  'Este é o menor preço que você já registrou neste item.',
  'Sua cesta ficou mais cara no período comparado.',
  'Um dos seus locais frequentes costuma ser mais econômico.',
  'Seu histórico já revela uma tendência de alta nos preços.',
]

function rollElement(element: HTMLElement, nextText: string) {
  const out = element.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-16px)' },
    ],
    { duration: 230, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
  )

  out.finished.then(() => {
    element.textContent = nextText
    element.animate(
      [
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    )
  }).catch(() => undefined)
}

function swapInsight(element: HTMLElement, nextText: string) {
  const out = element.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-7px)' },
    ],
    { duration: 260, easing: 'ease', fill: 'forwards' },
  )

  out.finished.then(() => {
    element.textContent = nextText
    element.animate(
      [
        { opacity: 0, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 420, easing: 'ease', fill: 'forwards' },
    )
  }).catch(() => undefined)
}

export function LandingLiveEffects() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== '/') return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const number = document.querySelector<HTMLElement>('.landing-hero-card .hero-number')
    const insight = document.querySelector<HTMLElement>('.landing-hero-card .hero-card-insight strong')

    if (!number || !insight) return

    number.setAttribute('aria-live', 'polite')
    insight.setAttribute('aria-live', 'polite')

    let numberIndex = 0
    let insightIndex = 0

    const numberTimer = window.setInterval(() => {
      numberIndex = (numberIndex + 1) % inflationValues.length
      rollElement(number, inflationValues[numberIndex])
    }, 3000)

    const insightTimer = window.setInterval(() => {
      insightIndex = (insightIndex + 1) % insightMessages.length
      swapInsight(insight, insightMessages[insightIndex])
    }, 10000)

    return () => {
      window.clearInterval(numberTimer)
      window.clearInterval(insightTimer)
    }
  }, [pathname])

  return null
}
