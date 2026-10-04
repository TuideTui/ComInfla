'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  initialStreetName?: string | null
  initialStreetNumber?: string | null
  initialComplement?: string | null
  initialNeighborhood?: string | null
  initialCity?: string | null
  initialState?: string | null
  initialPostalCode?: string | null
  initialLatitude?: number | string | null
  initialLongitude?: number | string | null
  initialLocationSource?: string | null
  legacyAddress?: string | null
}

type ReverseAddress = {
  streetName?: string
  streetNumber?: string
  neighborhood?: string
  city?: string
  state?: string
  postalCode?: string
  displayName?: string
}

export function AddressLocationFields({
  initialStreetName,
  initialStreetNumber,
  initialComplement,
  initialNeighborhood,
  initialCity,
  initialState,
  initialPostalCode,
  initialLatitude,
  initialLongitude,
  initialLocationSource,
  legacyAddress,
}: Props) {
  const [streetName, setStreetName] = useState(initialStreetName ?? '')
  const [streetNumber, setStreetNumber] = useState(initialStreetNumber ?? '')
  const [complement, setComplement] = useState(initialComplement ?? '')
  const [neighborhood, setNeighborhood] = useState(initialNeighborhood ?? '')
  const [city, setCity] = useState(initialCity ?? '')
  const [state, setState] = useState((initialState ?? '').toUpperCase())
  const [postalCode, setPostalCode] = useState(initialPostalCode ?? '')
  const [latitude, setLatitude] = useState(initialLatitude == null ? '' : String(initialLatitude))
  const [longitude, setLongitude] = useState(initialLongitude == null ? '' : String(initialLongitude))
  const [locationSource, setLocationSource] = useState(initialLocationSource ?? '')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const reverseRequestRef = useRef(0)

  function markAddressMode() {
    if (!['device', 'manual', 'disabled'].includes(locationSource)) setLocationSource('address')
  }

  function applyReverseAddress(address: ReverseAddress | null) {
    if (!address) return false
    let changed = false
    if (address.streetName) { setStreetName(address.streetName); changed = true }
    if (address.streetNumber) { setStreetNumber(address.streetNumber.slice(0, 10)); changed = true }
    if (address.neighborhood) { setNeighborhood(address.neighborhood); changed = true }
    if (address.city) { setCity(address.city); changed = true }
    if (address.state) { setState(address.state.toUpperCase().slice(0, 2)); changed = true }
    if (address.postalCode) { setPostalCode(address.postalCode.slice(0, 9)); changed = true }
    return changed
  }

  async function reverseFillAddress(lat: number, lon: number) {
    const requestId = ++reverseRequestRef.current
    setStatus('Ponto ajustado. Identificando o endereço automaticamente…')

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'reverse', latitude: lat, longitude: lon }),
      })
      const payload = await response.json() as { address?: ReverseAddress | null }
      if (requestId !== reverseRequestRef.current) return

      const filled = response.ok && applyReverseAddress(payload.address ?? null)
      setStatus(filled
        ? 'Ponto ajustado e endereço preenchido automaticamente. Revise os campos e salve o estabelecimento.'
        : 'Ponto ajustado. Não foi possível identificar todos os dados do endereço; você pode completar os campos manualmente.')
    } catch {
      if (requestId !== reverseRequestRef.current) return
      setStatus('Ponto ajustado. O endereço automático não ficou disponível agora; você pode completar os campos manualmente.')
    }
  }

  function setManualPoint(lat: number, lon: number) {
    setLatitude(lat.toFixed(7))
    setLongitude(lon.toFixed(7))
    setLocationSource('manual')
    void reverseFillAddress(lat, lon)
  }

  useEffect(() => {
    if (!mapOpen || !mapContainerRef.current) return
    let cancelled = false

    async function mount() {
      const L: any = await import('leaflet')
      if (cancelled || !mapContainerRef.current) return

      const parsedLat = Number(latitude)
      const parsedLon = Number(longitude)
      const hasPoint = latitude !== '' && longitude !== '' && Number.isFinite(parsedLat) && Number.isFinite(parsedLon)
      const center: [number, number] = hasPoint ? [parsedLat, parsedLon] : [-14.235, -51.9253]
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView(center, hasPoint ? 19 : 4)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 20,
      }).addTo(map)

      const icon = L.divIcon({
        className: 'coordinate-picker-icon',
        html: '<span></span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })

      function attachMarkerEvents(marker: any) {
        marker.on('dragend', () => {
          const point = marker.getLatLng()
          setManualPoint(point.lat, point.lng)
        })
      }

      if (hasPoint) {
        const marker = L.marker(center, { draggable: true, icon }).addTo(map)
        markerRef.current = marker
        attachMarkerEvents(marker)
      }

      map.on('click', (event: any) => {
        if (!markerRef.current) {
          markerRef.current = L.marker(event.latlng, { draggable: true, icon }).addTo(map)
          attachMarkerEvents(markerRef.current)
        } else {
          markerRef.current.setLatLng(event.latlng)
        }
        setManualPoint(event.latlng.lat, event.latlng.lng)
      })

      setTimeout(() => map.invalidateSize(), 0)
    }

    mount()
    return () => {
      cancelled = true
      markerRef.current = null
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  // O mapa é montado ao abrir. Mudanças de coordenadas são sincronizadas no efeito abaixo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOpen])

  useEffect(() => {
    if (!mapOpen || !mapRef.current || !markerRef.current || !latitude || !longitude) return
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    markerRef.current.setLatLng([lat, lon])
  }, [latitude, longitude, mapOpen])

  function locateDevice() {
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
        setLocationSource('device')
        setStatus(`Localização atual selecionada · precisão aproximada de ${Math.round(position.coords.accuracy)} m.`)
        setLoading(false)
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'Permissão de localização não concedida.' : 'Não foi possível obter sua localização agora.')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  }

  function useAddress() {
    setLatitude('')
    setLongitude('')
    setLocationSource('address')
    setMapOpen(false)
    setStatus('Ao salvar, o ComInfla fará uma nova busca pelo nome do estabelecimento + endereço.')
  }

  function removeFromMap() {
    setLatitude('')
    setLongitude('')
    setLocationSource('disabled')
    setMapOpen(false)
    setStatus('Este estabelecimento ficará fora do mapa até você escolher uma forma de localização novamente.')
  }

  async function toggleManualMap() {
    if (mapOpen) {
      setMapOpen(false)
      return
    }

    const hasCurrentCoordinates = Boolean(latitude && longitude)
    const hasCompleteAddress = Boolean(streetName.trim() && city.trim() && state.trim())

    if (!hasCurrentCoordinates && hasCompleteAddress) {
      setLoading(true)
      setStatus('Localizando o endereço para abrir o ajuste manual…')
      try {
        const response = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'forward',
            streetName,
            streetNumber,
            neighborhood,
            city,
            state,
            postalCode,
          }),
        })
        const payload = await response.json() as { result?: { latitude?: number; longitude?: number } | null }
        if (response.ok && payload.result?.latitude != null && payload.result?.longitude != null) {
          setLatitude(String(payload.result.latitude))
          setLongitude(String(payload.result.longitude))
          setLocationSource('address')
          setStatus('Endereço usado como ponto inicial. Clique ou arraste a bolinha para ajustar com precisão.')
        } else {
          setStatus('Não encontramos o endereço automaticamente. O mapa abrirá afastado; navegue até o local e clique no ponto exato.')
        }
      } catch {
        setStatus('Não conseguimos preparar o ponto pelo endereço. O mapa abrirá afastado; navegue até o local e clique no ponto exato.')
      } finally {
        setLoading(false)
      }
    } else if (!hasCurrentCoordinates) {
      setStatus('Navegue pelo mapa e clique no ponto exato do estabelecimento. O ComInfla tentará preencher o endereço automaticamente.')
    }

    setMapOpen(true)
  }

  const hasCoordinates = Boolean(latitude && longitude)
  const hasAddress = Boolean(streetName.trim() && city.trim() && state.trim())
  const sourceLabel = locationSource === 'manual'
    ? 'Ponto ajustado manualmente'
    : locationSource === 'device'
      ? 'Localização do dispositivo'
      : locationSource === 'address'
        ? 'Localização encontrada pelo endereço'
        : ''

  return (
    <div className="address-location-block">
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />
      <input type="hidden" name="location_source" value={locationSource} />
      <input type="hidden" name="legacy_address" value={legacyAddress ?? ''} />

      <div className="address-section-heading">
        <div>
          <span className="location-title">Endereço e mapa</span>
          <small>Se o endereço estiver completo, o ComInfla tenta localizar o estabelecimento automaticamente ao salvar.</small>
        </div>
      </div>

      <div className="address-grid">
        <label className="field address-street">
          <span>Logradouro</span>
          <input
            name="street_name"
            maxLength={160}
            value={streetName}
            placeholder="Ex.: Av. Celso Garcia"
            autoComplete="address-line1"
            onChange={(event) => { setStreetName(event.target.value); markAddressMode() }}
          />
        </label>
        <label className="field address-number">
          <span>Número</span>
          <input
            name="street_number"
            maxLength={10}
            value={streetNumber}
            placeholder="Ex.: 4856"
            onChange={(event) => { setStreetNumber(event.target.value); markAddressMode() }}
          />
        </label>
        <label className="field address-complement">
          <span>Complemento</span>
          <input
            name="address_complement"
            maxLength={100}
            value={complement}
            placeholder="Loja, bloco, piso..."
            autoComplete="address-line2"
            onChange={(event) => { setComplement(event.target.value); markAddressMode() }}
          />
        </label>
        <label className="field address-neighborhood">
          <span>Bairro</span>
          <input name="neighborhood" maxLength={120} value={neighborhood} placeholder="Ex.: Tatuapé" onChange={(event) => { setNeighborhood(event.target.value); markAddressMode() }} />
        </label>
        <label className="field address-city">
          <span>Cidade</span>
          <input name="city" maxLength={120} value={city} placeholder="Ex.: São Paulo" autoComplete="address-level2" onChange={(event) => { setCity(event.target.value); markAddressMode() }} />
        </label>
        <label className="field address-state">
          <span>UF</span>
          <input name="state" maxLength={2} value={state} placeholder="SP" autoComplete="address-level1" onChange={(event) => { setState(event.target.value.toUpperCase().slice(0, 2)); markAddressMode() }} />
        </label>
        <label className="field address-postal">
          <span>CEP</span>
          <input name="postal_code" maxLength={9} value={postalCode} placeholder="03064-000" inputMode="numeric" autoComplete="postal-code" onChange={(event) => { setPostalCode(event.target.value); markAddressMode() }} />
        </label>
      </div>

      {legacyAddress && !initialStreetName ? <p className="legacy-address-note">Endereço anterior: {legacyAddress}. Você pode separar os campos acima para melhorar a precisão do mapa.</p> : null}

      <div className="location-picker">
        <div>
          <span className="location-title">Posição no mapa</span>
          <small>
            {locationSource === 'disabled'
              ? 'Mapa desativado para este estabelecimento.'
              : hasCoordinates
                ? `${sourceLabel ? `${sourceLabel} · ` : ''}${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`
                : hasAddress
                  ? 'Endereço pronto para ser localizado ao salvar.'
                  : 'Sem posição definida. Você pode ajustar manualmente, usar o endereço ou sua localização atual.'}
          </small>
          {status ? <em>{status}</em> : null}
        </div>
        <div className="location-actions">
          <button type="button" className="ghost-button" onClick={toggleManualMap} disabled={loading}>{mapOpen ? 'Fechar ajuste' : 'Ajustar ponto no mapa'}</button>
          <button type="button" className="ghost-button" onClick={useAddress} disabled={!hasAddress || loading}>Usar endereço no mapa</button>
          <button type="button" className="ghost-button" onClick={locateDevice} disabled={loading}>{loading ? 'Aguarde…' : 'Usar minha localização atual'}</button>
          {(hasCoordinates || locationSource === 'address') && locationSource !== 'disabled' ? <button type="button" className="danger-link" onClick={removeFromMap}>Remover do mapa</button> : null}
        </div>
      </div>

      {mapOpen ? (
        <div className="coordinate-adjuster">
          <div className="coordinate-adjuster-copy">
            <strong>Ajuste fino da posição</strong>
            <span>{hasCoordinates ? 'Arraste a bolinha dourada até a entrada do estabelecimento ou clique no ponto exato do mapa.' : 'Navegue até o estabelecimento e clique no ponto exato. O ComInfla tentará preencher o endereço automaticamente.'}</span>
          </div>
          <div ref={mapContainerRef} className="coordinate-adjust-map" aria-label="Ajustar posição do estabelecimento no mapa" />
        </div>
      ) : null}

      <p className="map-privacy-note">Ao localizar pelo endereço ou escolher um ponto manualmente, o ComInfla envia apenas os dados necessários de endereço ou coordenadas ao serviço de geocodificação do OpenStreetMap. No ajuste manual, tentamos preencher logradouro, número, bairro, cidade, UF e CEP automaticamente para você revisar antes de salvar.</p>
    </div>
  )
}
