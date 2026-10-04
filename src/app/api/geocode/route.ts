import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { geocodeBrazilAddress } from '@/lib/geocode'

const STATE_CODES: Record<string, string> = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE',
  'Distrito Federal': 'DF', 'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', Pará: 'PA',
  Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI', 'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validCoordinate(value: unknown, min: number, max: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function stateCode(address: Record<string, unknown>) {
  const iso = clean(address['ISO3166-2-lvl4']) || clean(address['ISO3166-2-lvl6'])
  if (/^BR-[A-Z]{2}$/.test(iso)) return iso.slice(3)
  const state = clean(address.state)
  return STATE_CODES[state] ?? ''
}

async function reverseGeocode(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '18',
    addressdetails: '1',
  })

  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': 'ComInfla/1.0 (https://cominfla.vercel.app)',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) return null
  const payload = await response.json() as { display_name?: string; address?: Record<string, unknown> }
  const address = payload.address ?? {}

  return {
    streetName: clean(address.road) || clean(address.pedestrian) || clean(address.residential) || clean(address.footway) || clean(address.path),
    streetNumber: clean(address.house_number),
    neighborhood: clean(address.suburb) || clean(address.neighbourhood) || clean(address.city_district) || clean(address.quarter),
    city: clean(address.city) || clean(address.town) || clean(address.municipality) || clean(address.village),
    state: stateCode(address),
    postalCode: clean(address.postcode),
    displayName: clean(payload.display_name),
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const mode = clean(body.mode)

  try {
    if (mode === 'reverse') {
      const latitude = validCoordinate(body.latitude, -90, 90)
      const longitude = validCoordinate(body.longitude, -180, 180)
      if (latitude == null || longitude == null) {
        return NextResponse.json({ error: 'Coordenadas inválidas.' }, { status: 400 })
      }

      const address = await reverseGeocode(latitude, longitude)
      return NextResponse.json({ address })
    }

    if (mode === 'forward') {
      const result = await geocodeBrazilAddress({
        establishmentName: clean(body.establishmentName),
        streetName: clean(body.streetName),
        streetNumber: clean(body.streetNumber),
        neighborhood: clean(body.neighborhood),
        city: clean(body.city),
        state: clean(body.state),
        postalCode: clean(body.postalCode),
      })
      return NextResponse.json({ result })
    }

    return NextResponse.json({ error: 'Modo de geocodificação inválido.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Serviço de localização indisponível no momento.' }, { status: 502 })
  }
}
