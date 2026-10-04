'use client'

import { useEffect, useRef } from 'react'

export type MapPoint = {
  id: string
  name: string
  latitude: number
  longitude: number
  neighborhood?: string | null
  city?: string | null
  totalSpentCents: number
  purchaseCount: number
  lastPurchase?: string | null
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  }[char] ?? char))
}

function brl(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function ConsumptionMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: any
    let cancelled = false

    async function mountMap() {
      if (!containerRef.current || !points.length) return
      const L: any = await import('leaflet')
      if (cancelled || !containerRef.current) return

      map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      const group = L.featureGroup().addTo(map)
      points.forEach((point) => {
        const marker = L.circleMarker([point.latitude, point.longitude], {
          radius: 10,
          color: '#f0cf87',
          weight: 2,
          fillColor: '#d6a94f',
          fillOpacity: 0.86,
        }).addTo(group)
        const location = [point.neighborhood, point.city].filter(Boolean).join(' · ')
        marker.bindPopup(`
          <div class="map-popup">
            <strong>${escapeHtml(point.name)}</strong>
            ${location ? `<span>${escapeHtml(location)}</span>` : ''}
            <b>${brl(point.totalSpentCents)}</b>
            <small>${point.purchaseCount} ${point.purchaseCount === 1 ? 'compra' : 'compras'} registradas</small>
          </div>
        `)
      })

      if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 16)
      } else {
        map.fitBounds(group.getBounds().pad(0.16), { maxZoom: 16 })
      }
    }

    mountMap()
    return () => {
      cancelled = true
      if (map) map.remove()
    }
  }, [points])

  return <div ref={containerRef} className="consumption-map" aria-label="Mapa dos estabelecimentos cadastrados" />
}
