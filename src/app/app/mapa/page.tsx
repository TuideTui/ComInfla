import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { ConsumptionMap, type MapPoint } from '@/components/consumption-map'
import { formatBRL, formatDateTime } from '@/lib/format'

async function signedMediaUrl(supabase: any, path?: string | null) {
  if (!path) return null
  const { data } = await supabase.storage.from('cominfla-media').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

export default async function MapPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: establishments }, { data: purchases }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('establishments').select('id,name,establishment_type,visit_frequency,address_line,neighborhood,city,state,latitude,longitude,photo_path').is('archived_at', null).order('name'),
    supabase.from('purchases').select('id,establishment_id,total_cents,purchased_at').order('purchased_at', { ascending: false }),
  ])

  const metrics = new Map<string, { total: number; count: number; lastPurchase: string | null }>()
  for (const purchase of purchases ?? []) {
    if (!purchase.establishment_id) continue
    const current = metrics.get(purchase.establishment_id) ?? { total: 0, count: 0, lastPurchase: null }
    current.total += Number(purchase.total_cents ?? 0)
    current.count += 1
    if (!current.lastPurchase) current.lastPurchase = purchase.purchased_at
    metrics.set(purchase.establishment_id, current)
  }

  const points: MapPoint[] = (establishments ?? [])
    .filter((item) => item.latitude != null && item.longitude != null)
    .map((item) => {
      const metric = metrics.get(item.id) ?? { total: 0, count: 0, lastPurchase: null }
      return {
        id: item.id,
        name: item.name,
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        neighborhood: item.neighborhood,
        city: item.city,
        totalSpentCents: metric.total,
        purchaseCount: metric.count,
        lastPurchase: metric.lastPurchase,
      }
    })
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))

  const photoPairs = await Promise.all((establishments ?? []).filter((item) => item.photo_path).map(async (item) => [item.id, await signedMediaUrl(supabase, item.photo_path)] as const))
  const photoUrls = new Map(photoPairs)
  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const locatedIds = new Set(points.map((point) => point.id))
  const withoutLocation = (establishments ?? []).filter((item) => !locatedIds.has(item.id))
  const totalMapped = points.reduce((sum, point) => sum + point.totalSpentCents, 0)

  return (
    <main className="app-shell">
      <AppHeader active="mapa" firstName={firstName} />
      <section className="app-content">
        <div className="dashboard-heading">
          <div><span className="page-kicker">MAPA DA SUA ROTINA</span><h1>Onde seu consumo acontece</h1><p>Somente estabelecimentos que você cadastrou aparecem aqui.</p></div>
          <div className="heading-stats"><span>{points.length} no mapa</span><span>{formatBRL(totalMapped)} registrados</span></div>
        </div>

        {points.length ? (
          <section className="premium-card map-card">
            <ConsumptionMap points={points} />
            <div className="map-legend"><span><i /> Seus estabelecimentos</span><small>Mapa © OpenStreetMap contributors</small></div>
          </section>
        ) : (
          <section className="premium-card empty-map-state">
            <span className="page-kicker">AINDA SEM PONTOS</span>
            <h2>Adicione a localização de um estabelecimento</h2>
            <p>Abra um local cadastrado e use “Usar minha localização atual”. Assim ele passa a aparecer neste mapa.</p>
            <Link href="/app/comprando" className="button button-primary">Ir para estabelecimentos</Link>
          </section>
        )}

        <div className="map-place-grid">
          {points.map((point) => {
            const establishment = establishments?.find((item) => item.id === point.id)
            const photo = photoUrls.get(point.id)
            return (
              <article className="premium-card map-place-card" key={point.id}>
                {photo ? <img className="map-place-photo" src={photo} alt="" /> : <div className="map-place-photo map-place-photo-empty">{point.name.slice(0, 1).toUpperCase()}</div>}
                <div className="map-place-content">
                  <span className="page-kicker">{establishment?.visit_frequency === 'frequent' ? 'FREQUENTE' : establishment?.visit_frequency === 'one_time' ? 'VISITA ÚNICA' : 'OCASIONAL'}</span>
                  <h3>{point.name}</h3>
                  <p>{[establishment?.address_line, point.neighborhood, point.city].filter(Boolean).join(' · ') || 'Endereço não informado'}</p>
                  <div className="map-place-metrics"><span><b>{formatBRL(point.totalSpentCents)}</b><small>gasto registrado</small></span><span><b>{point.purchaseCount}</b><small>{point.purchaseCount === 1 ? 'compra' : 'compras'}</small></span></div>
                  {point.lastPurchase ? <small className="map-last-purchase">Última compra: {formatDateTime(point.lastPurchase)}</small> : <small className="map-last-purchase">Ainda sem compras registradas</small>}
                  <Link className="ghost-button" href={`/app/comprando/estabelecimento/${point.id}/editar`}>Editar local</Link>
                </div>
              </article>
            )
          })}
        </div>

        {withoutLocation.length ? (
          <section className="premium-card work-card map-missing-section">
            <div className="section-inline-heading"><div><span className="page-kicker">FORA DO MAPA</span><h2>{withoutLocation.length} {withoutLocation.length === 1 ? 'estabelecimento ainda não possui' : 'estabelecimentos ainda não possuem'} localização</h2><p>O endereço escrito continua salvo; a coordenada é o que permite criar o ponto no mapa.</p></div></div>
            <div className="missing-location-list">
              {withoutLocation.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{[item.neighborhood, item.city].filter(Boolean).join(' · ') || 'Sem localização informada'}</small></span><Link className="ghost-button" href={`/app/comprando/estabelecimento/${item.id}/editar`}>Adicionar localização</Link></div>)}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}
