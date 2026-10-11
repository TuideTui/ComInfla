'use client'

import { useEffect, useRef } from 'react'

const bars = [24, 31, 38, 47, 56, 66, 76, 88]
const inflationValues = ['+8,7%', '+2,1%', '+5,8%', '+0,5%', '+11,3%', '+3,4%']
const insightMessages = [
  'Seu custo de vida subiu acima do padrão da sua cesta.',
  'Você pagou abaixo da sua média histórica neste produto.',
  'Este é o menor preço que você já registrou neste item.',
  'Sua cesta ficou mais cara no período comparado.',
  'Um dos seus locais frequentes costuma ser mais econômico.',
  'Seu histórico já revela uma tendência de alta nos preços.',
]

async function animateSwap(element: HTMLElement, text: string, distance: number, reducedMotion: boolean) {
  if (reducedMotion) {
    element.textContent = text
    return
  }
  const outgoing = element.animate([
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: `translateY(-${distance}px)` },
  ], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
  try {
    await outgoing.finished
    if (!element.isConnected) return
    element.textContent = text
    outgoing.cancel()
    const incoming = element.animate([
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
    await incoming.finished
    incoming.cancel()
  } catch {
    // Unmounting cancels the short text animations.
  }
}

export function LandingGlassCard() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const numberRef = useRef<HTMLElement>(null)
  const insightRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const scene = sceneRef.current
    const card = cardRef.current
    const number = numberRef.current
    const insight = insightRef.current
    if (!scene || !card || !number || !insight) return

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = window.matchMedia('(min-width: 981px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    let visible = true
    let numberIndex = 0
    let insightIndex = 0
    let frame = 0
    let bounds: DOMRect | null = null
    let pointerX = 0
    let pointerY = 0
    const active = () => visible && document.visibilityState === 'visible'
    const updateActivity = () => { scene.dataset.active = String(active()) }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      updateActivity()
    })
    observer.observe(scene)
    document.addEventListener('visibilitychange', updateActivity)

    const numberTimer = window.setInterval(() => {
      if (!active()) return
      numberIndex = (numberIndex + 1) % inflationValues.length
      void animateSwap(number, inflationValues[numberIndex], 18, motion.matches)
    }, 3000)
    const insightTimer = window.setInterval(() => {
      if (!active()) return
      insightIndex = (insightIndex + 1) % insightMessages.length
      void animateSwap(insight, insightMessages[insightIndex], 8, motion.matches)
    }, 10000)

    const resetTilt = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
      bounds = null
      card.style.removeProperty('--glass-rotate-x')
      card.style.removeProperty('--glass-rotate-y')
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !pointer.matches || !active()) return
      bounds ??= scene.getBoundingClientRect()
      pointerX = event.clientX
      pointerY = event.clientY
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        if (!bounds) return
        const x = Math.max(-.5, Math.min(.5, (pointerX - bounds.left) / bounds.width - .5))
        const y = Math.max(-.5, Math.min(.5, (pointerY - bounds.top) / bounds.height - .5))
        card.style.setProperty('--glass-rotate-x', `${-8 - y * 8}deg`)
        card.style.setProperty('--glass-rotate-y', `${-12 + x * 12}deg`)
      })
    }
    scene.addEventListener('pointermove', move)
    scene.addEventListener('pointerleave', resetTilt)
    pointer.addEventListener('change', resetTilt)
    window.addEventListener('resize', resetTilt)

    return () => {
      window.clearInterval(numberTimer)
      window.clearInterval(insightTimer)
      resetTilt()
      observer.disconnect()
      document.removeEventListener('visibilitychange', updateActivity)
      scene.removeEventListener('pointermove', move)
      scene.removeEventListener('pointerleave', resetTilt)
      pointer.removeEventListener('change', resetTilt)
      window.removeEventListener('resize', resetTilt)
      number.getAnimations().forEach(animation => animation.cancel())
      insight.getAnimations().forEach(animation => animation.cancel())
    }
  }, [])

  return (
    <div className="hero-glass-scene" ref={sceneRef} data-active="true">
      <div className="hero-glass-shadow" aria-hidden="true" />
      <div className="premium-card hero-card landing-hero-card landing-glass-card" ref={cardRef}>
        <div className="hero-glass-back" aria-hidden="true" />
        <div className="hero-glass-edge hero-glass-edge-top" aria-hidden="true" />
        <div className="hero-glass-edge hero-glass-edge-right" aria-hidden="true" />
        <div className="hero-glass-edge hero-glass-edge-bottom" aria-hidden="true" />
        <div className="hero-glass-front" aria-hidden="true" />
        <div className="hero-card-topline">
          <span className="card-kicker">Exemplo de visualização</span>
          <span className="live-dot">ComInfla</span>
        </div>
        <div className="hero-number-layer">
          <strong className="hero-number" ref={numberRef} aria-live="polite">+8,7%</strong>
        </div>
        <span className="muted hero-period-label">Inflação pessoal · últimos 12 meses</span>
        <div className="bar-chart" role="img" aria-label="Exemplo visual de evolução da inflação">
          {bars.map((height, index) => (
            <span key={height} style={{ height: `${height}%` }} className={`hero-chart-column${index === bars.length - 1 ? ' active' : ''}`}>
              <span className="hero-bar-prism" aria-hidden="true">
                <i className="hero-bar-front" />
                <i className="hero-bar-top" />
                <i className="hero-bar-side" />
              </span>
            </span>
          ))}
        </div>
        <div className="hero-card-insight">
          <span>Insight</span>
          <strong ref={insightRef} aria-live="polite">{insightMessages[0]}</strong>
        </div>
      </div>
    </div>
  )
}
