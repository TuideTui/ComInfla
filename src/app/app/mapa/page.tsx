import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ConsumptionMap, type MapPoint } from '@/components/consumption-map'
import { formatBRL, formatDateTime } from '@/lib/format'

export default async function MapPage() {
  const supabase = await createClient()

  const [{ data: establishments }, { data: purchaseStats }] = await Promise.all([
    supabase.from('establishments').select('id,name,establishment_type,visit_frequency,address_line,neighborhood,city,state,latitude,longitude,photo_path').is('archived_at', null).order('name'),
    supabase.from('establishment_purchase_stats').select('establishment_id,total_cents,purchase_count,last_purchase_at'),
  ])

  const metrics = new Map((purchaseStats ?? []).map((item) => [item.establishment_id, {
    total: Number(item.total_cents ?? 0),
    count: Number(item.purchase_count ?? 0),
    lastPurchase: item.last_purchase_at as string | null,
  }]))

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

  const photoEntries = (establishments ?? [])
    .filter((item) => item.photo_path)
    .map((item) => ({ id: item.id, path: item.photo_path as string }))
  const photoUrls = new Map<string, string | null>()

  if (photoEntries.length) {
    const { data: signedUrls } = await supabase.storage
      .from('cominfla-media')
      .createSignedUrls(photoEntries.map((entry) => entry.path), 60 * 60)

    signedUrls?.forEach((item, index) => {
      const entry = photoEntries[index]
      if (entry) photoUrls.set(entry.id, item.signedUrl ?? null)
    })
  }

  const locatedIds = new Set(points.map((point) => point.id))
  const withoutLocation = (establishments ?? []).filter((item) => !locatedIds.has(item.id))
  const totalMapped = points.reduce((sum, point) => sum + point.totalSpentCents, 0)

  return (
    <main className="app-shell">
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
            <p>Abra um local cadastrado e use o endereço, a localização atual ou ajuste o ponto manualmente.</p>
            <Link href="/app/cadastrando" className="button button-primary">Ir para Cadastrando</Link>
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
                  <Link className="ghost-button" href={`/app/cadastrando/estabelecimento/${point.id}/editar`}>Editar local</Link>
                </div>
              </article>
            )
          })}
        </div>

        {withoutLocation.length ? (
          <section className="premium-card work-card map-missing-section">
            <div className="section-inline-heading"><div><span className="page-kicker">FORA DO MAPA</span><h2>{withoutLocation.length} {withoutLocation.length === 1 ? 'estabelecimento ainda não possui' : 'estabelecimentos ainda não possuem'} localização</h2><p>O endereço escrito continua salvo; a coordenada é o que permite criar o ponto no mapa.</p></div></div>
            <div className="missing-location-list">
              {withoutLocation.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{[item.neighborhood, item.city].filter(Boolean).join(' · ') || 'Sem localização informada'}</small></span><Link className="ghost-button" href={`/app/cadastrando/estabelecimento/${item.id}/editar`}>Adicionar localização</Link></div>)}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}
