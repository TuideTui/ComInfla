import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PurchaseForm } from '@/components/purchase-form'
import { PurchaseInsightModal } from '@/components/purchase-insight-modal'
import { deletePurchase } from './actions'
import { formatBRL, formatDateTime, productLabel } from '@/lib/format'
import { insightDescription } from '@/lib/insights'

type Params = Record<string, string | string[] | undefined>

export default async function ShoppingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const supabase = await createClient()

  const purchaseId = typeof params.purchase === 'string' ? params.purchase : ''
  const [{ data: products }, { data: establishments }, { data: purchases }, { data: priceStats }] = await Promise.all([
    supabase.from('products').select('id,name,brand,presentation,base_quantity,unit,packaging,subcategory,category_id').is('archived_at', null).order('name'),
    supabase.from('establishments').select('id,name,establishment_type,visit_frequency,neighborhood,city,state').is('archived_at', null).order('visit_frequency').order('name'),
    supabase.from('purchases').select('id,purchased_at,total_cents,payment_method,notes,establishment_name_snapshot,establishment:establishments(id,name,neighborhood),items:purchase_items(id,product_id,quantity,unit_price_cents,total_cents,is_promotion,product_snapshot,product:products(id,name,brand,presentation,base_quantity,unit,packaging),insights:insight_events(id,title,message,severity,insight_type,metric_value,metadata))').order('purchased_at', { ascending: false }).limit(30),
    supabase.from('product_price_stats').select('product_id,price_count,average_unit_price_cents'),
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

  const averages = new Map<string, { average: number; count: number }>()
  for (const row of priceStats ?? []) {
    averages.set(row.product_id, {
      average: Number(row.average_unit_price_cents ?? 0),
      count: Number(row.price_count ?? 0),
    })
  }

  const messageText = typeof params.message === 'string' ? params.message : undefined
  const errorText = typeof params.error === 'string' ? params.error : undefined
  const readyToBuy = Boolean(products?.length && establishments?.length)

  return (
    <main className="app-shell">
      <PurchaseInsightModal insights={freshInsights} />
      <section className="app-content">
        <div className="dashboard-heading">
          <div>
            <span className="page-kicker">REGISTRO E HISTÓRICO</span>
            <h1>Comprando</h1>
            <p>Registre compras reais da sua rotina e acompanhe os indicadores identificados em cada preço.</p>
          </div>
          <div className="heading-stats">
            <span>{purchases?.length ?? 0} registros recentes</span>
            <span>{products?.length ?? 0} produtos disponíveis</span>
            <span>{establishments?.length ?? 0} locais disponíveis</span>
          </div>
        </div>

        {errorText ? <div className="notice notice-error page-notice">{errorText}</div> : null}
        {messageText ? <div className="notice notice-success page-notice">{messageText}</div> : null}

        <section className="premium-card work-card" id="registrar-compra">
          <div className="section-inline-heading">
            <div>
              <span className="page-kicker">REGISTRO RÁPIDO</span>
              <h2>Registrar compra</h2>
              <p>Escolha o estabelecimento, os produtos e informe somente a quantidade realmente comprada naquele momento.</p>
            </div>
            <Link className="text-link small" href="/app/cadastrando">Gerenciar cadastros →</Link>
          </div>

          {readyToBuy ? (
            <PurchaseForm products={products as any} establishments={establishments as any} />
          ) : (
            <div className="setup-state">
              <strong>Prepare sua base primeiro</strong>
              <p>Para registrar uma compra, você precisa de pelo menos um produto e um estabelecimento cadastrados.</p>
              <div className="setup-steps">
                <span className={products?.length ? 'done' : ''}>1. Produto {products?.length ? '✓' : ''}</span>
                <span className={establishments?.length ? 'done' : ''}>2. Estabelecimento {establishments?.length ? '✓' : ''}</span>
                <span>3. Compra</span>
              </div>
              <Link className="button button-primary setup-cta" href="/app/cadastrando">Abrir Cadastrando</Link>
            </div>
          )}
        </section>

        <section className="premium-card work-card history-section">
          <div className="section-inline-heading">
            <div><span className="page-kicker">SEU HISTÓRICO</span><h2>Compras recentes</h2><p>Preço, local e indicadores que foram identificados no momento do registro.</p></div>
          </div>

          {purchases?.length ? (
            <div className="purchase-history">
              {purchases.map((purchase: any) => (
                <article className="history-row" key={purchase.id}>
                  <div className="history-date">
                    <strong>{formatDateTime(purchase.purchased_at).split(' ')[0]}</strong>
                    <span>{formatDateTime(purchase.purchased_at).split(' ').slice(1).join(' ')}</span>
                  </div>

                  <div className="history-main">
                    <div className="history-title">
                      <strong>{purchase.establishment?.name ?? purchase.establishment_name_snapshot ?? 'Local não informado'}</strong>
                      <span>{purchase.items?.length ?? 0} {purchase.items?.length === 1 ? 'item' : 'itens'} · {formatBRL(purchase.total_cents)}</span>
                    </div>

                    <div className="history-item-head"><span>Produto</span><span>Qtd.</span><span>Preço unit.</span><span>Comparação</span><span>Status</span></div>
                    <div className="history-items">
                      {(purchase.items ?? []).map((item: any) => {
                        const product = item.product ?? item.product_snapshot
                        const avg = averages.get(item.product_id)
                        const average = avg?.average ?? 0
                        const delta = average ? ((Number(item.unit_price_cents) / average) - 1) * 100 : 0

                        return (
                          <div className="history-product-block" key={item.id}>
                            <div className="history-item-line">
                              <span>{productLabel(product)}</span>
                              <span className="history-qty">× {Number(item.quantity).toLocaleString('pt-BR')}</span>
                              <b>{formatBRL(item.unit_price_cents)}</b>
                              {avg && avg.count > 1
                                ? <em className={delta > 5 ? 'delta-up' : delta < -5 ? 'delta-down' : ''}>{delta > 0 ? '+' : ''}{delta.toFixed(1).replace('.', ',')}% vs. média</em>
                                : <em>primeiro histórico</em>}
                              {item.is_promotion ? <small>promoção</small> : <small className="history-status-neutral">—</small>}
                            </div>
                            {item.insights?.length ? (
                              <div className="history-insights">
                                {item.insights.map((insight: any) => (
                                  <span className={`history-insight-pill ${insight.severity}`} title={insightDescription(insight)} key={insight.id}>{insight.title}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="history-actions">
                    <Link className="ghost-button" href={`/app/comprando/compra/${purchase.id}/editar`}>Editar</Link>
                    <form action={deletePurchase}>
                      <input type="hidden" name="purchase_id" value={purchase.id} />
                      <button className="danger-link" type="submit">Excluir</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Nenhuma compra registrada</strong>
              <p>Quando registrar a primeira compra, ela aparecerá aqui com preço, quantidade e comparações automáticas.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
