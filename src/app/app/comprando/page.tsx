import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { PurchaseForm } from '@/components/purchase-form'
import { PurchaseInsightModal } from '@/components/purchase-insight-modal'
import { MediaUpload } from '@/components/media-upload'
import { AddressLocationFields } from '@/components/address-location-fields'
import { createProduct, deletePurchase } from './actions'
import { createEstablishmentV2 } from './establishment-actions'
import { formatBRL, formatDateTime, productLabel } from '@/lib/format'
import { insightDescription } from '@/lib/insights'

type Params = Record<string, string | string[] | undefined>

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

export default async function ShoppingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const purchaseId = typeof params.purchase === 'string' ? params.purchase : ''
  const [{ data: profile }, { data: categories }, { data: products }, { data: establishments }, { data: purchases }, { data: allPrices }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('categories').select('id,name,parent_id').is('archived_at', null).order('name'),
    supabase.from('products').select('id,name,brand,presentation,base_quantity,unit,packaging,subcategory,category_id,photo_path,created_at').is('archived_at', null).order('created_at', { ascending: false }),
    supabase.from('establishments').select('id,name,establishment_type,visit_frequency,address_line,street_name,street_number,address_complement,neighborhood,city,state,postal_code,latitude,longitude,location_source,photo_path,created_at').is('archived_at', null).order('visit_frequency').order('name'),
    supabase.from('purchases').select('id,purchased_at,total_cents,payment_method,notes,establishment_name_snapshot,establishment:establishments(id,name,neighborhood),items:purchase_items(id,product_id,quantity,unit_price_cents,total_cents,is_promotion,product_snapshot,product:products(id,name,brand,presentation,base_quantity,unit,packaging),insights:insight_events(id,title,message,severity,insight_type,metric_value,metadata))').order('purchased_at', { ascending: false }).limit(30),
    supabase.from('purchase_items').select('product_id,unit_price_cents'),
  ])

  let freshInsights: any[] = []
  if (purchaseId) {
    const { data: savedItems } = await supabase.from('purchase_items').select('id').eq('purchase_id', purchaseId)
    const ids = savedItems?.map((item) => item.id) ?? []
    if (ids.length) {
      const { data } = await supabase.from('insight_events').select('id,title,message,severity,insight_type,metric_value,metadata').in('purchase_item_id', ids).order('created_at', { ascending: false })
      freshInsights = data ?? []
    }
  }

  const photoEntries = [
    ...(products ?? []).filter((item) => item.photo_path).map((item) => ({ key: `product:${item.id}`, path: item.photo_path })),
    ...(establishments ?? []).filter((item) => item.photo_path).map((item) => ({ key: `establishment:${item.id}`, path: item.photo_path })),
  ]
  const signedPairs = await Promise.all(photoEntries.map(async (entry) => [entry.key, await signedMediaUrl(supabase, entry.path)] as const))
  const photoUrls = new Map(signedPairs)

  const averages = new Map<string, { total: number; count: number }>()
  for (const row of allPrices ?? []) {
    const current = averages.get(row.product_id) ?? { total: 0, count: 0 }
    current.total += Number(row.unit_price_cents)
    current.count += 1
    averages.set(row.product_id, current)
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const messageText = typeof params.message === 'string' ? params.message : undefined
  const errorText = typeof params.error === 'string' ? params.error : undefined

  return (
    <main className="app-shell">
      <AppHeader active="comprando" firstName={firstName} />
      <PurchaseInsightModal insights={freshInsights} />
      <section className="app-content">
        <div className="dashboard-heading">
          <div><span className="page-kicker">REGISTRO E HISTÓRICO</span><h1>Comprando</h1><p>Cadastre sua rotina real de consumo em poucos segundos.</p></div>
          <div className="heading-stats"><span>{products?.length ?? 0} produtos</span><span>{establishments?.length ?? 0} locais</span><span>{purchases?.length ?? 0} registros recentes</span></div>
        </div>

        {errorText ? <div className="notice notice-error page-notice">{errorText}</div> : null}
        {messageText ? <div className="notice notice-success page-notice">{messageText}</div> : null}

        <section className="premium-card work-card" id="registrar-compra">
          <div className="section-inline-heading">
            <div><span className="page-kicker">REGISTRO RÁPIDO</span><h2>Registrar compra</h2><p>Escolha o produto e informe somente a quantidade realmente comprada naquele momento.</p></div>
          </div>
          {products?.length && establishments?.length ? (
            <PurchaseForm products={products as any} establishments={establishments as any} />
          ) : (
            <div className="setup-state">
              <strong>Prepare sua base primeiro</strong>
              <p>Para registrar sua primeira compra, você precisa de pelo menos um produto e um estabelecimento.</p>
              <div className="setup-steps"><span className={products?.length ? 'done' : ''}>1. Produto {products?.length ? '✓' : ''}</span><span className={establishments?.length ? 'done' : ''}>2. Estabelecimento {establishments?.length ? '✓' : ''}</span><span>3. Compra</span></div>
            </div>
          )}
        </section>

        <div className="management-grid">
          <details className="premium-card manage-card" open={!products?.length}>
            <summary><div><span className="page-kicker">CATÁLOGO</span><strong>Novo produto</strong></div><span>+</span></summary>
            <form action={createProduct} className="data-form">
              <MediaUpload name="photo_path" userId={userId} folder="products" label="Foto do produto" />
              <div className="form-grid-2">
                <label className="field"><span>Nome *</span><input name="name" maxLength={160} placeholder="Ex.: Coca-Cola Original" required /></label>
                <label className="field"><span>Marca</span><input name="brand" maxLength={120} placeholder="Ex.: Coca-Cola" /></label>
                <label className="field"><span>Categoria</span><select name="category_id"><option value="">Sem categoria</option>{categories?.filter((item) => !item.parent_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="field"><span>Subcategoria</span><input name="subcategory" maxLength={100} placeholder="Ex.: Refrigerantes" /></label>
                <label className="field"><span>Apresentação</span><input name="presentation" maxLength={100} placeholder="Ex.: 350 ml, 1 kg, lata 269 ml" /></label>
                <label className="field"><span>Embalagem</span><input name="packaging" maxLength={80} placeholder="Lata, garrafa, caixa..." /></label>
                <label className="field"><span>Código de barras</span><input name="barcode" maxLength={80} inputMode="numeric" placeholder="Opcional" /></label>
              </div>
              <p className="form-explainer">A apresentação identifica a versão do produto. A quantidade que você comprou será informada somente na hora de registrar a compra.</p>
              <label className="field"><span>Observação</span><textarea name="notes" rows={2} placeholder="Detalhes que ajudam a diferenciar o produto." /></label>
              <button className="button button-primary" type="submit">Cadastrar produto</button>
            </form>
          </details>

          <details className="premium-card manage-card" open={!establishments?.length}>
            <summary><div><span className="page-kicker">SUA ROTINA</span><strong>Novo estabelecimento</strong></div><span>+</span></summary>
            <form action={createEstablishmentV2} className="data-form">
              <MediaUpload name="photo_path" userId={userId} folder="establishments" label="Foto do estabelecimento" />
              <div className="form-grid-2">
                <label className="field"><span>Nome *</span><input name="name" maxLength={160} placeholder="Ex.: Mercado perto de casa" required /></label>
                <label className="field"><span>Tipo</span><select name="establishment_type">{establishmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="field"><span>Frequência</span><select name="visit_frequency" defaultValue="frequent"><option value="frequent">Frequente</option><option value="occasional">Ocasional</option><option value="one_time">Visita única</option></select></label>
              </div>
              <AddressLocationFields />
              <label className="field"><span>Observação</span><textarea name="notes" rows={2} /></label>
              <button className="button button-primary" type="submit">Cadastrar estabelecimento</button>
            </form>
          </details>
        </div>

        <section className="premium-card work-card history-section">
          <div className="section-inline-heading"><div><span className="page-kicker">SEU HISTÓRICO</span><h2>Compras recentes</h2><p>Preço, local e indicadores identificados em cada compra.</p></div></div>
          {purchases?.length ? (
            <div className="purchase-history">
              {purchases.map((purchase: any) => (
                <article className="history-row" key={purchase.id}>
                  <div className="history-date"><strong>{formatDateTime(purchase.purchased_at).split(' ')[0]}</strong><span>{formatDateTime(purchase.purchased_at).split(' ').slice(1).join(' ')}</span></div>
                  <div className="history-main">
                    <div className="history-title"><strong>{purchase.establishment?.name ?? purchase.establishment_name_snapshot ?? 'Local não informado'}</strong><span>{purchase.items?.length ?? 0} {purchase.items?.length === 1 ? 'item' : 'itens'} · {formatBRL(purchase.total_cents)}</span></div>
                    <div className="history-item-head"><span>Produto</span><span>Qtd.</span><span>Preço unit.</span><span>Comparação</span><span>Status</span></div>
                    <div className="history-items">
                      {(purchase.items ?? []).map((item: any) => {
                        const product = item.product ?? item.product_snapshot
                        const avg = averages.get(item.product_id)
                        const average = avg?.count ? avg.total / avg.count : 0
                        const delta = average ? ((Number(item.unit_price_cents) / average) - 1) * 100 : 0
                        return <div className="history-product-block" key={item.id}>
                          <div className="history-item-line">
                            <span>{productLabel(product)}</span>
                            <span className="history-qty">× {Number(item.quantity).toLocaleString('pt-BR')}</span>
                            <b>{formatBRL(item.unit_price_cents)}</b>
                            {avg && avg.count > 1 ? <em className={delta > 5 ? 'delta-up' : delta < -5 ? 'delta-down' : ''}>{delta > 0 ? '+' : ''}{delta.toFixed(1).replace('.', ',')}% vs. média</em> : <em>primeiro histórico</em>}
                            {item.is_promotion ? <small>promoção</small> : <small className="history-status-neutral">—</small>}
                          </div>
                          {item.insights?.length ? <div className="history-insights">{item.insights.map((insight: any) => <span className={`history-insight-pill ${insight.severity}`} title={insightDescription(insight)} key={insight.id}>{insight.title}</span>)}</div> : null}
                        </div>
                      })}
                    </div>
                  </div>
                  <div className="history-actions">
                    <Link className="ghost-button" href={`/app/comprando/compra/${purchase.id}/editar`}>Editar</Link>
                    <form action={deletePurchase}><input type="hidden" name="purchase_id" value={purchase.id} /><button className="danger-link" type="submit">Excluir</button></form>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><strong>Nenhuma compra registrada</strong><p>Cadastre seus primeiros produtos e locais. Assim que registrar uma compra, ela aparecerá aqui com comparações automáticas.</p></div>}
        </section>

        <div className="catalog-preview-grid">
          <section className="premium-card compact-list">
            <div className="section-inline-heading"><div><h3>Produtos monitorados</h3><p>Edite nome, apresentação, categoria, foto ou arquive um cadastro.</p></div></div>
            {products?.slice(0, 12).map((product) => {
              const photo = photoUrls.get(`product:${product.id}`)
              return <div className="compact-row entity-row" key={product.id}>
                <div className="entity-row-main">
                  {photo ? <img className="entity-thumb" src={photo} alt="" /> : <div className="entity-thumb entity-thumb-empty">P</div>}
                  <span><strong>{product.name}</strong><small>{[product.brand, product.presentation, product.packaging].filter(Boolean).join(' · ') || 'Sem detalhes adicionais'}</small></span>
                </div>
                <div className="compact-row-actions"><em>{product.subcategory || '—'}</em><Link className="ghost-button" href={`/app/comprando/produto/${product.id}/editar`}>Editar</Link></div>
              </div>
            })}
            {!products?.length ? <p className="muted">Seu catálogo ainda está vazio.</p> : null}
          </section>

          <section className="premium-card compact-list">
            <div className="section-inline-heading"><div><h3>Estabelecimentos</h3><p>Endereço, foto e localização podem ser ajustados a qualquer momento.</p></div><Link className="text-link small" href="/app/mapa">Abrir mapa →</Link></div>
            {establishments?.slice(0, 12).map((item) => {
              const photo = photoUrls.get(`establishment:${item.id}`)
              return <div className="compact-row entity-row" key={item.id}>
                <div className="entity-row-main">
                  {photo ? <img className="entity-thumb" src={photo} alt="" /> : <div className="entity-thumb entity-thumb-empty">L</div>}
                  <span><strong>{item.name}</strong><small>{item.neighborhood || item.city || 'Localização não informada'}{item.latitude != null && item.longitude != null ? ' · no mapa' : ''}</small></span>
                </div>
                <div className="compact-row-actions"><em>{item.visit_frequency === 'frequent' ? 'Frequente' : item.visit_frequency === 'one_time' ? 'Visita única' : 'Ocasional'}</em><Link className="ghost-button" href={`/app/comprando/estabelecimento/${item.id}/editar`}>Editar</Link></div>
              </div>
            })}
            {!establishments?.length ? <p className="muted">Nenhum local cadastrado ainda.</p> : null}
          </section>
        </div>
      </section>
    </main>
  )
}
