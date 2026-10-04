'use client'

import { useState } from 'react'

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

  function markAddressMode() {
    if (locationSource !== 'device' && locationSource !== 'disabled') setLocationSource('address')
  }

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
    setStatus('Ao salvar, o ComInfla tentará localizar este endereço automaticamente no mapa.')
  }

  function removeFromMap() {
    setLatitude('')
    setLongitude('')
    setLocationSource('disabled')
    setStatus('Este estabelecimento ficará fora do mapa até você escolher uma forma de localização novamente.')
  }

  const hasCoordinates = Boolean(latitude && longitude)
  const hasAddress = Boolean(streetName.trim() && city.trim() && state.trim())

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
        <label className="field">
          <span>Bairro</span>
          <input name="neighborhood" maxLength={120} value={neighborhood} placeholder="Ex.: Tatuapé" onChange={(event) => { setNeighborhood(event.target.value); markAddressMode() }} />
        </label>
        <label className="field">
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
                ? `Coordenadas salvas: ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`
                : hasAddress
                  ? 'Endereço pronto para ser localizado ao salvar.'
                  : 'Preencha logradouro, cidade e UF ou use sua localização atual.'}
          </small>
          {status ? <em>{status}</em> : null}
        </div>
        <div className="location-actions">
          <button type="button" className="ghost-button" onClick={useAddress} disabled={!hasAddress || loading}>Usar endereço no mapa</button>
          <button type="button" className="ghost-button" onClick={locateDevice} disabled={loading}>{loading ? 'Localizando…' : 'Usar minha localização atual'}</button>
          {(hasCoordinates || locationSource === 'address') && locationSource !== 'disabled' ? <button type="button" className="danger-link" onClick={removeFromMap}>Remover do mapa</button> : null}
        </div>
      </div>

      <p className="map-privacy-note">Para localizar um endereço digitado, o ComInfla envia somente os dados do endereço ao serviço de geocodificação do OpenStreetMap no momento em que você salva o estabelecimento.</p>
    </div>
  )
}
