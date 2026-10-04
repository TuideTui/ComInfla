type GeocodeInput = {
  establishmentName?: string | null
  streetName?: string | null
  streetNumber?: string | null
  legacyAddress?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}

type GeocodeResult = {
  latitude: number
  longitude: number
  displayName?: string
}

function clean(value?: string | null) {
  return (value ?? '').trim()
}

function firstResult(payload: unknown): GeocodeResult | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  const row = payload[0] as { lat?: string; lon?: string; display_name?: string }
  const latitude = Number(row.lat)
  const longitude = Number(row.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude, displayName: row.display_name }
}

async function nominatimSearch(params: URLSearchParams): Promise<GeocodeResult | null> {
  params.set('format', 'jsonv2')
  params.set('limit', '1')
  params.set('countrycodes', 'br')
  params.set('addressdetails', '1')

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent': 'ComInfla/1.0 (https://cominfla.vercel.app)',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    return firstResult(await response.json())
  } catch {
    return null
  }
}

export function buildAddressLine(input: GeocodeInput & { complement?: string | null }) {
  const street = clean(input.streetName)
  const number = clean(input.streetNumber)
  const complement = clean(input.complement)
  if (!street) return clean(input.legacyAddress)

  let line = street
  if (number) line += `, ${number}`
  if (complement) line += ` - ${complement}`
  return line
}

export function hasGeocodableAddress(input: GeocodeInput) {
  return Boolean((clean(input.streetName) || clean(input.legacyAddress)) && clean(input.city) && clean(input.state))
}

export async function geocodeBrazilAddress(input: GeocodeInput): Promise<GeocodeResult | null> {
  const establishmentName = clean(input.establishmentName)
  const streetName = clean(input.streetName)
  const streetNumber = clean(input.streetNumber)
  const legacyAddress = clean(input.legacyAddress)
  const city = clean(input.city)
  const state = clean(input.state)
  const postalCode = clean(input.postalCode).replace(/[^0-9-]/g, '')
  const neighborhood = clean(input.neighborhood)

  if (!hasGeocodableAddress(input)) return null

  // Primeiro tenta encontrar o POI pelo nome + endereço. Quando o estabelecimento
  // existe no OpenStreetMap, isso costuma ser mais preciso que a interpolação do número da rua.
  if (establishmentName) {
    const poiParts = [
      establishmentName,
      streetName ? `${streetName}${streetNumber ? `, ${streetNumber}` : ''}` : legacyAddress,
      neighborhood,
      city,
      state,
      postalCode,
      'Brasil',
    ].filter(Boolean)
    const poi = await nominatimSearch(new URLSearchParams({ q: poiParts.join(', ') }))
    if (poi) return poi
  }

  if (streetName) {
    const structured = new URLSearchParams()
    structured.set('street', `${streetNumber ? `${streetNumber} ` : ''}${streetName}`)
    if (city) structured.set('city', city)
    if (state) structured.set('state', state)
    if (postalCode) structured.set('postalcode', postalCode)
    structured.set('country', 'Brasil')
    const found = await nominatimSearch(structured)
    if (found) return found
  }

  const freeformParts = [
    streetName ? `${streetName}${streetNumber ? `, ${streetNumber}` : ''}` : legacyAddress,
    neighborhood,
    city,
    state,
    postalCode,
    'Brasil',
  ].filter(Boolean)

  return nominatimSearch(new URLSearchParams({ q: freeformParts.join(', ') }))
}
