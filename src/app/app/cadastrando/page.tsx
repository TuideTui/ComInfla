import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { MediaUpload } from '@/components/media-upload'
import { AddressLocationFields } from '@/components/address-location-fields'
import { RegistrationModal } from '@/components/registration-modal'
import { createProduct } from './actions'
import { createEstablishment } from './establishment-actions'

type Params = Record<string, string | string[] | undefined>

const establishmentTypes = [
  ['supermarket', 'Supermercado'], ['market', 'Mercado'], ['bakery', 'Padaria'], ['restaurant', 'Restaurante'],
  ['snack_bar', 'Lanchonete'], ['pharmacy', 'Farmácia'], ['convenience', 'Conveniência'], ['gas_station', 'Posto de combustível'],
  ['fair', 'Feira'], ['shopping', 'Shopping'], ['cinema', 'Cinema'], ['service', 'Serviço'], ['other', 'Outro'],
]

const frequencyLabels: Record<string, string> = {
  frequent: 'Frequente',
  occasional: 'Ocasional',
  one_time: 'Visita única',
}

async function signedMediaUrl(supabase: any, path?: string | null) {
  if (!path) return null
  const { data } = await supabase.storage.from('cominfla-media').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

export default async function RegisteringPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: categories }, { data: products }, { data: establishments }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('categories').select('id,name,parent_id').is('archived_at', null).order('name'),
    supabase.from('products').select('id,name,brand,presentation,packaging,subcategory,photo_path,created_at').is('archived_at', null).order('name'),
    supabase.from('establishments').select('id,name,visit_frequency,neighborhood,city,state,latitude,longitude,photo_path').is('archived_at', null).order('name'),
  ])

  const photoEntries = [
    ...(products ?? []).filter((item) => item.photo_path).map((item) => ({ key: `product:${item.id}`, path: item.photo_path })),
    ...(establishments ?? []).filter((item) => item.photo_path).map((item) => ({ key: `establishment:${item.id}`, path: item.photo_path })),
  ]
  const signedPairs = await Promise.all(photoEntries.map(async (entry) => [entry.key, await signedMediaUrl(supabase, entry.path)] as const))
  const photoUrls = new Map(signedPairs)

  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const messageText = typeof params.message === 'string' ? params.message : undefined
  const errorText = typeof params.error === 'string' ? params.error : undefined

  return (
    <main className="app-shell">
      <AppHeader active="cadastrando" firstName={firstName} />
      <section className="app-content">
        <div className="dashboard-heading">
          <div>
            <span className="page-kicker">CATÁLOGO E SUA ROTINA</span>
            <h1>Cadastrando</h1>
            <p>Organize os produtos e estabelecimentos que fazem parte da sua rotina antes de registrar suas compras.</p>
          </div>
          <div className="heading-stats">
            <span>{products?.length ?? 0} produtos</span>
            <span>{establishments?.length ?? 0} locais</span>
          </div>
        </div>

        {errorText ? <div className="notice notice-error page-notice">{errorText}</div> : null}
        {messageText ? <div className="notice notice-success page-notice">{messageText}</div> : null}

        <div className="registering-launch-grid">
          <RegistrationModal
            kind="product"
            kicker="CATÁLOGO"
            title="Cadastrar produto"
            description="Adicione um item ao seu catálogo para começar a acompanhar preços e histórico."
          >
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
              <p className="form-explainer">A apresentação identifica a versão do produto. A quantidade comprada é informada somente quando você registra uma compra.</p>
              <label className="field"><span>Observação</span><textarea name="notes" rows={2} placeholder="Detalhes que ajudam a diferenciar o produto." /></label>
              <button className="button button-primary" type="submit">Cadastrar produto</button>
            </form>
          </RegistrationModal>

          <RegistrationModal
            kind="establishment"
            kicker="SUA ROTINA"
            title="Cadastrar estabelecimento"
            description="Cadastre um local da sua rotina e, se quiser, posicione-o no mapa."
          >
            <form action={createEstablishment} className="data-form">
              <MediaUpload name="photo_path" userId={userId} folder="establishments" label="Foto do estabelecimento" />
              <div className="form-grid-2">
                <label className="field"><span>Nome *</span><input name="name" maxLength={160} placeholder="Ex.: Mercado perto de casa" required /></label>
                <label className="field"><span>Tipo</span><select name="establishment_type">{establishmentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="field"><span>Frequência</span><select name="visit_frequency" defaultValue="frequent"><option value="frequent">Frequente</option><option value="occasional">Ocasional</option><option value="one_time">Visita única</option></select></label>
              </div>
              <AddressLocationFields />
              <label className="field"><span>Observação</span><textarea name="notes" rows={2} placeholder="Detalhes úteis sobre este local." /></label>
              <button className="button button-primary" type="submit">Cadastrar estabelecimento</button>
            </form>
          </RegistrationModal>
        </div>

        <div className="catalog-preview-grid registering-catalog-grid">
          <section className="premium-card compact-list">
            <div className="section-inline-heading">
              <div><span className="page-kicker">SEU CATÁLOGO</span><h3>Produtos monitorados</h3><p>Edite nome, apresentação, categoria, foto ou arquive um cadastro.</p></div>
              <span className="catalog-count">{products?.length ?? 0}</span>
            </div>
            {products?.length ? products.map((product) => {
              const photo = photoUrls.get(`product:${product.id}`)
              return (
                <div className="compact-row entity-row" key={product.id}>
                  <div className="entity-row-main">
                    {photo ? <img className="entity-thumb" src={photo} alt="" /> : <div className="entity-thumb entity-thumb-empty">P</div>}
                    <span>
                      <strong>{product.name}</strong>
                      <small>{[product.brand, product.presentation, product.packaging].filter(Boolean).join(' · ') || 'Sem detalhes adicionais'}</small>
                    </span>
                  </div>
                  <div className="compact-row-actions">
                    <em>{product.subcategory || '—'}</em>
                    <Link className="ghost-button" href={`/app/cadastrando/produto/${product.id}/editar`}>Editar</Link>
                  </div>
                </div>
              )
            }) : <p className="muted">Seu catálogo ainda está vazio.</p>}
          </section>

          <section className="premium-card compact-list">
            <div className="section-inline-heading">
              <div><span className="page-kicker">SUA ROTINA</span><h3>Estabelecimentos</h3><p>Endereço, foto e localização podem ser ajustados a qualquer momento.</p></div>
              <Link className="text-link small" href="/app/mapa">Abrir mapa →</Link>
            </div>
            {establishments?.length ? establishments.map((item) => {
              const photo = photoUrls.get(`establishment:${item.id}`)
              const locationLabel = item.latitude != null && item.longitude != null ? 'no mapa' : 'fora do mapa'
              const place = [item.neighborhood, item.city].filter(Boolean).join(' · ') || 'Endereço não informado'
              return (
                <div className="compact-row entity-row" key={item.id}>
                  <div className="entity-row-main">
                    {photo ? <img className="entity-thumb" src={photo} alt="" /> : <div className="entity-thumb entity-thumb-empty">L</div>}
                    <span>
                      <strong>{item.name}</strong>
                      <small>{place} · {locationLabel}</small>
                    </span>
                  </div>
                  <div className="compact-row-actions">
                    <em>{frequencyLabels[item.visit_frequency] ?? 'Ocasional'}</em>
                    <Link className="ghost-button" href={`/app/cadastrando/estabelecimento/${item.id}/editar`}>Editar</Link>
                  </div>
                </div>
              )
            }) : <p className="muted">Nenhum estabelecimento cadastrado.</p>}
          </section>
        </div>
      </section>
    </main>
  )
}
