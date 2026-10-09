'use client'

import { useEffect } from 'react'

const inflationValues = ['+8,7%', '+2,1%', '+5,8%', '+0,5%', '+11,3%', '+3,4%']

const insightMessages = [
  'Seu custo de vida subiu acima do padrão da sua cesta.',
  'Você pagou abaixo da sua média histórica neste produto.',
  'Este é o menor preço que você já registrou neste item.',
  'Sua cesta ficou mais cara no período comparado.',
  'Um dos seus locais frequentes costuma ser mais econômico.',
  'Seu histórico já revela uma tendência de alta nos preços.',
]

function animateSwap(element: HTMLElement, nextText: string, distance: number) {
  const out = element.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: `translateY(-${distance}px)` },
    ],
    { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
  )

  out.finished
    .then(() => {
      element.textContent = nextText
      element.animate(
        [
          { opacity: 0, transform: `translateY(${distance}px)` },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      )
    })
    .catch(() => undefined)
}

export function LandingLiveEffects() {
  useEffect(() => {
    let numberTimer: number | undefined
    let insightTimer: number | undefined
    let startTimer: number | undefined
    let attempts = 0

    const start = () => {
      const number = document.querySelector<HTMLElement>('.landing-hero-card .hero-number')
      const insight = document.querySelector<HTMLElement>('.landing-hero-card .hero-card-insight strong')
      const hero = document.querySelector<HTMLElement>('.landing-hero')

      if (!number || !insight || !hero) {
        attempts += 1
        if (attempts < 20) startTimer = window.setTimeout(start, 150)
        return
      }

      hero.classList.add('landing-motion-ready')
      number.setAttribute('aria-live', 'polite')
      insight.setAttribute('aria-live', 'polite')

      let numberIndex = 0
      let insightIndex = 0

      numberTimer = window.setInterval(() => {
        numberIndex = (numberIndex + 1) % inflationValues.length
        animateSwap(number, inflationValues[numberIndex], 18)
      }, 3000)

      insightTimer = window.setInterval(() => {
        insightIndex = (insightIndex + 1) % insightMessages.length
        animateSwap(insight, insightMessages[insightIndex], 8)
      }, 10000)
    }

    startTimer = window.setTimeout(start, 250)

    return () => {
      if (startTimer) window.clearTimeout(startTimer)
      if (numberTimer) window.clearInterval(numberTimer)
      if (insightTimer) window.clearInterval(insightTimer)
    }
  }, [])

  return null
}
