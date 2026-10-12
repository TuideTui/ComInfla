'use client'

import { useEffect, useRef, useState } from 'react'
import { glassBars, inflationValues, insightMessages } from './landing-glass-data'
import type { GlassScene } from './landing-glass-renderer'

export function LandingGlassCard() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [numberIndex, setNumberIndex] = useState(0)
  const [insightIndex, setInsightIndex] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const abort = new AbortController()
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let scene: GlassScene | undefined
    let visible = false
    let loading = false
    let currentNumber = 0
    let currentInsight = 0
    const active = () => visible && document.visibilityState === 'visible'
    const updateActivity = () => {
      host.dataset.active = String(active())
      scene?.setActivity(active(), motion.matches)
    }
    const fallback = () => {
      scene?.dispose()
      scene = undefined
      setReady(false)
    }
    const loadScene = async () => {
      if (loading || abort.signal.aborted) return
      loading = true
      try {
        const { createGlassScene } = await import('./landing-glass-renderer')
        if (abort.signal.aborted) return
        scene = await createGlassScene(canvas, abort.signal, fallback)
        if (abort.signal.aborted) {
          scene.dispose()
          return
        }
        scene.setNumber(currentNumber)
        scene.setInsight(currentInsight)
        updateActivity()
        setReady(true)
      } catch {
        // The original, accessible card also works without WebGL or GPU acceleration.
        if (!abort.signal.aborted) fallback()
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) void loadScene()
      updateActivity()
    })
    observer.observe(host)
    document.addEventListener('visibilitychange', updateActivity)
    motion.addEventListener('change', updateActivity)

    const numberTimer = window.setInterval(() => {
      if (!active()) return
      currentNumber = (currentNumber + 1) % inflationValues.length
      setNumberIndex(currentNumber)
      scene?.setNumber(currentNumber)
    }, 3000)
    const insightTimer = window.setInterval(() => {
      if (!active()) return
      currentInsight = (currentInsight + 1) % insightMessages.length
      setInsightIndex(currentInsight)
      scene?.setInsight(currentInsight)
    }, 10000)

    return () => {
      abort.abort()
      observer.disconnect()
      document.removeEventListener('visibilitychange', updateActivity)
      motion.removeEventListener('change', updateActivity)
      window.clearInterval(numberTimer)
      window.clearInterval(insightTimer)
      scene?.dispose()
    }
  }, [])

  return (
    <div className="hero-glass-scene" ref={hostRef} data-ready={ready} data-active="false">
      <canvas className="hero-glass-canvas" ref={canvasRef} aria-hidden="true" />
      <div className={`premium-card hero-card landing-hero-card hero-glass-fallback${ready ? ' hero-glass-accessible' : ''}`}>
        <div className="hero-card-topline">
          <span className="card-kicker">Exemplo de visualização</span>
          <span className="live-dot">ComInfla</span>
        </div>
        <strong className="hero-number" aria-live="polite">{inflationValues[numberIndex]}</strong>
        <span className="muted">Inflação pessoal · últimos 12 meses</span>
        <div className="bar-chart" role="img" aria-label="Exemplo visual de evolução da inflação">
          {glassBars.map((height, index) => (
            <span key={index} style={{ height: `${height / 2.5 * 100}%` }} className={index === glassBars.length - 1 ? 'active' : undefined} />
          ))}
        </div>
        <div className="hero-card-insight">
          <span>Insight</span>
          <strong aria-live="polite">{insightMessages[insightIndex]}</strong>
        </div>
      </div>
    </div>
  )
}
