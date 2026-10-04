'use client'

import { useState } from 'react'

export function LocationPicker({
  initialLatitude,
  initialLongitude,
}: {
  initialLatitude?: number | string | null
  initialLongitude?: number | string | null
}) {
  const [latitude, setLatitude] = useState(initialLatitude == null ? '' : String(initialLatitude))
  const [longitude, setLongitude] = useState(initialLongitude == null ? '' : String(initialLongitude))
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  function locate() {
    if (!navigator.geolocation) {
      setStatus('Seu navegador não oferece acesso à localização.')
      return
    }

    setLoading(true)
    setStatus('Solicitando sua localização…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7))
        setLongitude(position.coords.longitude.toFixed(7))
        setStatus(`Localização adicionada · precisão aproximada de ${Math.round(position.coords.accuracy)} m.`)
        setLoading(false)
      },
      (error) => {
        const text = error.code === error.PERMISSION_DENIED
          ? 'Permissão de localização não concedida.'
          : 'Não foi possível obter sua localização agora.'
        setStatus(text)
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }

  function clear() {
    setLatitude('')
    setLongitude('')
    setStatus('Localização removida deste estabelecimento.')
  }

  const hasLocation = Boolean(latitude && longitude)

  return (
    <div className="location-picker">
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />
      <div>
        <span className="location-title">Localização no mapa</span>
        <small>
          {hasLocation
            ? `Coordenadas salvas: ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`
            : 'Opcional. Use quando estiver no estabelecimento para posicioná-lo no mapa.'}
        </small>
        {status ? <em>{status}</em> : null}
      </div>
      <div className="location-actions">
        <button type="button" className="ghost-button" disabled={loading} onClick={locate}>
          {loading ? 'Localizando…' : hasLocation ? 'Atualizar localização' : 'Usar minha localização atual'}
        </button>
        {hasLocation ? <button type="button" className="danger-link" onClick={clear}>Remover</button> : null}
      </div>
    </div>
  )
}
