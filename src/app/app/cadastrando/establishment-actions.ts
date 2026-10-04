'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildAddressLine, geocodeBrazilAddress, hasGeocodableAddress } from '@/lib/geocode'

const MEDIA_BUCKET = 'cominfla-media'

function message(value: string) {
  return encodeURIComponent(value)
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function parseCoordinate(value: FormDataEntryValue | null, min: number, max: number) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function validMediaPath(value: FormDataEntryValue | null, userId: string) {
  const path = String(value ?? '').trim()
  if (!path) return null
  return path.startsWith(`${userId}/establishments/`) ? path : null
}

async function authenticatedClient() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')
  return { supabase, userId }
}

function revalidateConsumptionPages() {
  revalidatePath('/app')
  revalidatePath('/app/cadastrando')
  revalidatePath('/app/comprando')
  revalidatePath('/app/analises')
  revalidatePath('/app/comparar')
  revalidatePath('/app/fechamento')
  revalidatePath('/app/mapa')
}

function addressPayload(formData: FormData) {
  const streetName = text(formData, 'street_name')
  const streetNumber = text(formData, 'street_number').slice(0, 10)
  const complement = text(formData, 'address_complement')
  const neighborhood = text(formData, 'neighborhood')
  const city = text(formData, 'city')
  const state = text(formData, 'state').toUpperCase().slice(0, 2)
  const postalCode = text(formData, 'postal_code').replace(/[^0-9-]/g, '').slice(0, 9)
  const legacyAddress = text(formData, 'legacy_address')
  const addressLine = buildAddressLine({ streetName, streetNumber, complement, legacyAddress })
  return { streetName, streetNumber, complement, neighborhood, city, state, postalCode, legacyAddress, addressLine }
}

async function resolveLocation(
  formData: FormData,
  address: ReturnType<typeof addressPayload>,
  establishmentName: string,
  current?: any,
) {
  const requestedSource = text(formData, 'location_source')
  const submittedLatitude = parseCoordinate(formData.get('latitude'), -90, 90)
  const submittedLongitude = parseCoordinate(formData.get('longitude'), -180, 180)

  if (requestedSource === 'disabled') {
    return { latitude: null, longitude: null, locationSource: 'disabled' as const, failed: false }
  }

  if ((requestedSource === 'device' || requestedSource === 'manual') && submittedLatitude != null && submittedLongitude != null) {
    return { latitude: submittedLatitude, longitude: submittedLongitude, locationSource: requestedSource as 'device' | 'manual', failed: false }
  }

  const geocodeInput = {
    establishmentName,
    streetName: address.streetName,
    streetNumber: address.streetNumber,
    legacyAddress: address.addressLine || address.legacyAddress,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
  }

  if (hasGeocodableAddress(geocodeInput)) {
    const unchangedAddress = current
      && requestedSource === 'address'
      && submittedLatitude != null
      && submittedLongitude != null
      && current.location_source === 'address'
      && String(current.address_line ?? '') === address.addressLine
      && String(current.neighborhood ?? '') === address.neighborhood
      && String(current.city ?? '') === address.city
      && String(current.state ?? '') === address.state
      && String(current.postal_code ?? '') === address.postalCode

    if (unchangedAddress) {
      return { latitude: submittedLatitude, longitude: submittedLongitude, locationSource: 'address' as const, failed: false }
    }

    const found = await geocodeBrazilAddress(geocodeInput)
    if (found) {
      return { latitude: found.latitude, longitude: found.longitude, locationSource: 'address' as const, failed: false }
    }
    return { latitude: null, longitude: null, locationSource: null, failed: true }
  }

  if (submittedLatitude != null && submittedLongitude != null) {
    return {
      latitude: submittedLatitude,
      longitude: submittedLongitude,
      locationSource: requestedSource === 'manual' ? 'manual' : requestedSource === 'device' ? 'device' : current?.location_source ?? 'legacy',
      failed: false,
    }
  }

  return { latitude: null, longitude: null, locationSource: null, failed: false }
}

export async function createEstablishment(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const name = text(formData, 'name')
  const establishmentType = text(formData, 'establishment_type') || 'other'
  const visitFrequency = text(formData, 'visit_frequency') || 'occasional'
  const notes = text(formData, 'notes')
  const photoPath = validMediaPath(formData.get('photo_path'), userId)
  const address = addressPayload(formData)

  if (!name) redirect(`/app/cadastrando?error=${message('Informe o nome do estabelecimento.')}`)

  const { data: existing } = await supabase
    .from('establishments')
    .select('id,name,neighborhood')
    .ilike('name', name)
    .is('archived_at', null)
    .limit(5)

  if (existing?.some((item) => (item.neighborhood ?? '').toLowerCase() === address.neighborhood.toLowerCase())) {
    redirect(`/app/cadastrando?error=${message('Já existe um estabelecimento com esse nome e bairro.')}`)
  }

  const location = await resolveLocation(formData, address, name)
  const { error } = await supabase.from('establishments').insert({
    name,
    establishment_type: establishmentType,
    visit_frequency: visitFrequency,
    address_line: address.addressLine || null,
    street_name: address.streetName || null,
    street_number: address.streetNumber || null,
    address_complement: address.complement || null,
    neighborhood: address.neighborhood || null,
    city: address.city || null,
    state: address.state || null,
    postal_code: address.postalCode || null,
    latitude: location.latitude,
    longitude: location.longitude,
    location_source: location.locationSource,
    notes: notes || null,
    photo_path: photoPath,
  })

  if (error) redirect(`/app/cadastrando?error=${message('Não foi possível cadastrar o estabelecimento.')}`)
  revalidateConsumptionPages()

  const feedback = location.locationSource === 'device'
    ? 'Estabelecimento cadastrado usando sua localização atual.'
    : location.locationSource === 'manual'
      ? 'Estabelecimento cadastrado com a posição ajustada manualmente no mapa.'
      : location.locationSource === 'address'
        ? 'Estabelecimento cadastrado e localizado automaticamente no mapa pelo endereço.'
        : location.failed
          ? 'Estabelecimento cadastrado, mas não conseguimos localizar esse endereço no mapa. Revise logradouro, cidade, UF e CEP.'
          : 'Estabelecimento cadastrado. Preencha o endereço depois se quiser exibi-lo no mapa.'

  redirect(`/app/cadastrando?message=${message(feedback)}`)
}

export async function updateEstablishment(formData: FormData) {
  const { supabase, userId } = await authenticatedClient()
  const establishmentId = text(formData, 'establishment_id')
  const name = text(formData, 'name')
  if (!establishmentId || !name) redirect(`/app/cadastrando?error=${message('Estabelecimento inválido.')}`)

  const { data: current } = await supabase
    .from('establishments')
    .select('id,photo_path,address_line,neighborhood,city,state,postal_code,latitude,longitude,location_source')
    .eq('id', establishmentId)
    .single()
  if (!current) redirect(`/app/cadastrando?error=${message('Estabelecimento não encontrado.')}`)

  const establishmentType = text(formData, 'establishment_type') || 'other'
  const visitFrequency = text(formData, 'visit_frequency') || 'occasional'
  const notes = text(formData, 'notes')
  const photoPath = validMediaPath(formData.get('photo_path'), userId)
  const address = addressPayload(formData)
  const location = await resolveLocation(formData, address, name, current)

  const { error } = await supabase.from('establishments').update({
    name,
    establishment_type: establishmentType,
    visit_frequency: visitFrequency,
    address_line: address.addressLine || null,
    street_name: address.streetName || null,
    street_number: address.streetNumber || null,
    address_complement: address.complement || null,
    neighborhood: address.neighborhood || null,
    city: address.city || null,
    state: address.state || null,
    postal_code: address.postalCode || null,
    latitude: location.latitude,
    longitude: location.longitude,
    location_source: location.locationSource,
    notes: notes || null,
    photo_path: photoPath,
    updated_at: new Date().toISOString(),
  }).eq('id', establishmentId)

  if (error) redirect(`/app/cadastrando/estabelecimento/${establishmentId}/editar?error=${message('Não foi possível atualizar o estabelecimento.')}`)

  if (current.photo_path && current.photo_path !== photoPath) {
    await supabase.storage.from(MEDIA_BUCKET).remove([current.photo_path])
  }

  revalidateConsumptionPages()
  const feedback = location.locationSource === 'address'
    ? 'Estabelecimento atualizado e posição do mapa sincronizada com o endereço.'
    : location.locationSource === 'device'
      ? 'Estabelecimento atualizado usando sua localização atual.'
      : location.locationSource === 'manual'
        ? 'Estabelecimento atualizado com o ponto ajustado manualmente no mapa.'
        : location.locationSource === 'disabled'
          ? 'Estabelecimento atualizado e removido do mapa.'
          : location.failed
            ? 'Estabelecimento atualizado, mas o endereço não pôde ser localizado no mapa.'
            : 'Estabelecimento atualizado.'

  redirect(`/app/cadastrando?message=${message(feedback)}`)
}
