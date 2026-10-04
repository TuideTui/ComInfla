import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { MediaUpload } from '@/components/media-upload'
import { AddressLocationFields } from '@/components/address-location-fields'
import { deleteOrArchiveEstablishment } from '@/app/app/comprando/actions'
import { updateEstablishmentV2 } from '@/app/app/comprando/establishment-actions'

const establishmentTypes = [
  ['supermarket', 'Supermercado'], ['market', 'Mercado'], ['bakery', 'Padaria'], ['restaurant', 'Restaurante'],
  ['snack_bar', 'Lanchonete'], ['pharmacy', 'Farmácia'], ['convenience', 'Conveniência'], ['gas_station', 'Posto de combustível'],
  ['fair', 'Feira'], ['shopping', 'Shopping'], ['cinema', 'Cinema'], ['service', 'Serviço'], ['other', 'Outro'],
]

async function signedMediaUrl(supabase: any, path?: string | null) {
  if (!path) return null
  const { data } = await supabase.storage.from('cominfla-media').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

function parseLegacyAddress(address?: string | null) {
  if (!address) return { streetName: '', streetNumber: '' }
  const head = address.split(' - ')[0].trim()
  const comma = head.lastIndexOf(',')
  if (comma < 0) return { streetName: head, streetNumber: '' }
  const possibleNumber = head.slice(comma + 1).trim()
  if (!/^[0-9A-Za-z/.-]{1,10}$/.test(possibleNumber)) return { streetName: head, streetNumber: '' }
  return { streetName: head.slice(0, comma).trim(), streetNumber: possibleNumber }
}

export default async function EditEstablishmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: establishment }, { count: purchaseCount }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('establishments').select('id,name,establishment_type,visit_frequency,address_line,street_name,street_number,address_complement,neighborhood,city,state,postal_code,latitude,longitude,location_source,notes,photo_path,archived_at').eq('id', id).single(),
    supabase.from('purchases').select('*', { head: true, count: 'exact' }).eq('establishment_id', id),
  ])

  if (!establishment) notFound()
  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const photoUrl = await signedMediaUrl(supabase, establishment.photo_path)
  const error = typeof query.error === 'string' ? query.error : undefined
  const legacy = !establishment.street_name ? parseLegacyAddress(establishment.address_line) : { streetName: '', streetNumber: '' }
  const initialLocationSource = establishment.location_source === 'disabled'
    ? 'disabled'
    : establishment.location_source === 'address'
      ? 'address'
      : ''

  return (
    <main className="app-shell">
      <AppHeader active="comprando" firstName={firstName} />
      <section className="app-content narrow-content">
        <div className="edit-page-heading">
          <div><span className="page-kicker">GERENCIAR ESTABELECIMENTO</span><h1>{establishment.name}</h1><p>Atualize endereço, frequência, foto ou posição no mapa.</p></div>
          <Link className="ghost-button" href="/app/comprando">← Voltar para Comprando</Link>
        </div>

        {error ? <div className="notice notice-error page-notice">{error}</div> : null}

        <section className="premium-card edit-card">
          <form action={updateEstablishmentV2} className="data-form edit-form">
            <input type="hidden" name="establishment_id" value={establishment.id} />
            <MediaUpload name="photo_path" userId={userId} folder="establishments" initialPath={establishment.photo_path} initialUrl={photoUrl} label="Foto do estabelecimento" />
            <div className="form-grid-2">
              <label className="field"><span>Nome *</span><input name="name" maxLength={160} defaultValue={establishment.name} required /></label>
              <label className="field"><span>Tipo</span><select name="establishment_type" defaultValue={establishment.establishment_type}>{establishmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>Frequência</span><select name="visit_frequency" defaultValue={establishment.visit_frequency}><option value="frequent">Frequente</option><option value="occasional">Ocasional</option><option value="one_time">Visita única</option></select></label>
            </div>

            <AddressLocationFields
              initialStreetName={establishment.street_name ?? legacy.streetName}
              initialStreetNumber={establishment.street_number ?? legacy.streetNumber}
              initialComplement={establishment.address_complement}
              initialNeighborhood={establishment.neighborhood}
              initialCity={establishment.city}
              initialState={establishment.state}
              initialPostalCode={establishment.postal_code}
              initialLatitude={establishment.latitude}
              initialLongitude={establishment.longitude}
              initialLocationSource={initialLocationSource}
              legacyAddress={establishment.address_line}
            />

            <label className="field"><span>Observação</span><textarea name="notes" rows={3} defaultValue={establishment.notes ?? ''} /></label>
            <div className="edit-actions"><Link className="ghost-button" href="/app/comprando">Cancelar</Link><button className="button button-primary" type="submit">Salvar estabelecimento</button></div>
          </form>
        </section>

        <section className="premium-card danger-zone">
          <div><span className="page-kicker">REMOVER DA SUA ROTINA</span><h2>{(purchaseCount ?? 0) > 0 ? 'Arquivar estabelecimento' : 'Excluir estabelecimento'}</h2><p>{(purchaseCount ?? 0) > 0 ? `Este local possui ${purchaseCount} compra(s). Ele será arquivado para preservar o histórico e deixará de aparecer em novas compras e no mapa ativo.` : 'Este estabelecimento ainda não possui compras e pode ser excluído definitivamente.'}</p></div>
          <form action={deleteOrArchiveEstablishment}><input type="hidden" name="establishment_id" value={establishment.id} /><button className="danger-button" type="submit">{(purchaseCount ?? 0) > 0 ? 'Arquivar estabelecimento' : 'Excluir estabelecimento'}</button></form>
        </section>
      </section>
    </main>
  )
}
