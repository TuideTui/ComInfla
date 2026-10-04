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

  function markAddressMode() {
    if (!['device', 'manual', 'disabled'].includes(locationSource)) setLocationSource('address')
  }

  function setManualPoint(lat: number, lon: number) {
    setLatitude(lat.toFixed(7))
    setLongitude(lon.toFixed(7))
    setLocationSource('manual')
    setStatus('Ponto ajustado manualmente. Salve o estabelecimento para confirmar a nova posição.')
  }

  useEffect(() => {
    if (!mapOpen || !mapContainerRef.current || !latitude || !longitude) return
    let cancelled = false

    async function mount() {
      const L: any = await import('leaflet')
      if (cancelled || !mapContainerRef.current) return

      const lat = Number(latitude)
      const lon = Number(longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([lat, lon], 19)
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

      const marker = L.marker([lat, lon], { draggable: true, icon }).addTo(map)
      markerRef.current = marker

      marker.on('dragend', () => {
        const point = marker.getLatLng()
        setManualPoint(point.lat, point.lng)
      })

      map.on('click', (event: any) => {
        marker.setLatLng(event.latlng)
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
                  : 'Preencha logradouro, cidade e UF ou use sua localização atual.'}
          </small>
          {status ? <em>{status}</em> : null}
        </div>
        <div className="location-actions">
          <button type="button" className="ghost-button" onClick={useAddress} disabled={!hasAddress || loading}>Usar endereço no mapa</button>
          <button type="button" className="ghost-button" onClick={locateDevice} disabled={loading}>{loading ? 'Localizando…' : 'Usar minha localização atual'}</button>
          {hasCoordinates ? <button type="button" className="ghost-button" onClick={() => setMapOpen((value) => !value)}>{mapOpen ? 'Fechar ajuste' : 'Ajustar ponto no mapa'}</button> : null}
          {(hasCoordinates || locationSource === 'address') && locationSource !== 'disabled' ? <button type="button" className="danger-link" onClick={removeFromMap}>Remover do mapa</button> : null}
        </div>
      </div>

      {mapOpen && hasCoordinates ? (
        <div className="coordinate-adjuster">
          <div className="coordinate-adjuster-copy">
            <strong>Ajuste fino da posição</strong>
            <span>Arraste a bolinha dourada até a entrada do estabelecimento ou clique no ponto exato do mapa.</span>
          </div>
          <div ref={mapContainerRef} className="coordinate-adjust-map" aria-label="Ajustar posição do estabelecimento no mapa" />
        </div>
      ) : null}

      <p className="map-privacy-note">Para localizar um endereço digitado, o ComInfla envia somente os dados do estabelecimento e do endereço ao serviço de geocodificação do OpenStreetMap no momento em que você salva. Se o resultado não for exato, use “Ajustar ponto no mapa”.</p>
    </div>
  )
}
