'use client'

import { useEffect, useRef, useState } from 'react'
import { getImageProps } from 'next/image'
import previewDesktop from '../../public/images/landing-glass-preview-desktop.png'
import previewCompact from '../../public/images/landing-glass-preview-compact.png'
import { glassBars, inflationValues, insightMessages } from './landing-glass-data'
import type { GlassScene } from './landing-glass-renderer'

const previewOptions = {
  alt: '', fill: true, loading: 'eager' as const, fetchPriority: 'high' as const,
  sizes: '(max-width: 620px) calc(100vw - 28px), (max-width: 980px) 640px, (max-width: 1344px) 44vw, 540px',
}
const { props: previewProps } = getImageProps({ ...previewOptions, src: previewDesktop })
const { props: { srcSet: compactPreview } } = getImageProps({ ...previewOptions, src: previewCompact })

export function LandingGlassCard() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [numberIndex, setNumberIndex] = useState(0)
  const [insightIndex, setInsightIndex] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const abort = new AbortController()
    let scene: GlassScene | undefined
    let visible = false
    let loading = false
    let hasFailed = false
    let currentNumber = 0
    let currentInsight = 0
    const active = () => visible && document.visibilityState === 'visible'
    const updateActivity = () => {
      host.dataset.active = String(active())
      scene?.setActivity(active())
    }
    const fallback = () => {
      scene?.dispose()
      scene = undefined
      hasFailed = true
      setFailed(true)
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
    updateActivity()

    const numberTimer = window.setInterval(() => {
      if (!active() || (!scene && !hasFailed)) return
      currentNumber = (currentNumber + 1) % inflationValues.length
      setNumberIndex(currentNumber)
      scene?.setNumber(currentNumber)
    }, 3000)
    const insightTimer = window.setInterval(() => {
      if (!active() || (!scene && !hasFailed)) return
      currentInsight = (currentInsight + 1) % insightMessages.length
      setInsightIndex(currentInsight)
      scene?.setInsight(currentInsight)
    }, 10000)

    return () => {
      abort.abort()
      observer.disconnect()
      document.removeEventListener('visibilitychange', updateActivity)
      window.clearInterval(numberTimer)
      window.clearInterval(insightTimer)
      scene?.dispose()
    }
  }, [])

  return (
    <div className="hero-glass-scene" ref={hostRef} data-ready={ready} data-fallback={failed} data-active="false">
      <picture className="hero-glass-preview" aria-hidden="true">
        <source media="(max-width: 447px), (min-width: 981px) and (max-width: 1084px)" srcSet={compactPreview} />
        <img {...previewProps} />
      </picture>
      <canvas className="hero-glass-canvas" ref={canvasRef} aria-hidden="true" />
      <div className={`premium-card hero-card landing-hero-card hero-glass-fallback${failed ? '' : ' hero-glass-accessible'}`}>
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
