import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { MediaUpload } from '@/components/media-upload'
import { deleteOrArchiveProduct, updateProduct } from '@/app/app/comprando/actions'

async function signedMediaUrl(supabase: any, path?: string | null) {
  if (!path) return null
  const { data } = await supabase.storage.from('cominfla-media').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

export default async function EditProductPage({
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

  const [{ data: profile }, { data: product }, { data: categories }, { count: purchaseCount }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('products').select('id,name,brand,presentation,category_id,subcategory,packaging,barcode,notes,photo_path,archived_at').eq('id', id).single(),
    supabase.from('categories').select('id,name,parent_id').is('archived_at', null).order('name'),
    supabase.from('purchase_items').select('*', { head: true, count: 'exact' }).eq('product_id', id),
  ])

  if (!product) notFound()
  const firstName = profile?.full_name?.split(' ')[0] || 'você'
  const photoUrl = await signedMediaUrl(supabase, product.photo_path)
  const error = typeof query.error === 'string' ? query.error : undefined

  return (
    <main className="app-shell">
      <AppHeader active="comprando" firstName={firstName} />
      <section className="app-content narrow-content">
        <div className="edit-page-heading">
          <div><span className="page-kicker">GERENCIAR PRODUTO</span><h1>{product.name}</h1><p>Altere os dados do catálogo sem apagar o histórico já registrado.</p></div>
          <Link className="ghost-button" href="/app/comprando">← Voltar para Comprando</Link>
        </div>

        {error ? <div className="notice notice-error page-notice">{error}</div> : null}

        <section className="premium-card edit-card">
          <form action={updateProduct} className="data-form edit-form">
            <input type="hidden" name="product_id" value={product.id} />
            <MediaUpload name="photo_path" userId={userId} folder="products" initialPath={product.photo_path} initialUrl={photoUrl} label="Foto do produto" />
            <div className="form-grid-2">
              <label className="field"><span>Nome *</span><input name="name" maxLength={160} defaultValue={product.name} required /></label>
              <label className="field"><span>Marca</span><input name="brand" maxLength={120} defaultValue={product.brand ?? ''} /></label>
              <label className="field"><span>Categoria</span><select name="category_id" defaultValue={product.category_id ?? ''}><option value="">Sem categoria</option>{categories?.filter((item) => !item.parent_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="field"><span>Subcategoria</span><input name="subcategory" maxLength={100} defaultValue={product.subcategory ?? ''} /></label>
              <label className="field"><span>Apresentação</span><input name="presentation" maxLength={100} defaultValue={product.presentation ?? ''} placeholder="Ex.: 350 ml, 1 kg, lata 269 ml" /></label>
              <label className="field"><span>Embalagem</span><input name="packaging" maxLength={80} defaultValue={product.packaging ?? ''} /></label>
              <label className="field"><span>Código de barras</span><input name="barcode" maxLength={80} defaultValue={product.barcode ?? ''} inputMode="numeric" /></label>
            </div>
            <p className="form-explainer">A quantidade comprada não faz parte deste cadastro. Ela é informada em cada compra. Ao salvar este produto, cadastros antigos como “2 unit” também são normalizados.</p>
            <label className="field"><span>Observação</span><textarea name="notes" rows={3} defaultValue={product.notes ?? ''} /></label>
            <div className="edit-actions"><Link className="ghost-button" href="/app/comprando">Cancelar</Link><button className="button button-primary" type="submit">Salvar produto</button></div>
          </form>
        </section>

        <section className="premium-card danger-zone">
          <div><span className="page-kicker">REMOVER DO CATÁLOGO</span><h2>{(purchaseCount ?? 0) > 0 ? 'Arquivar produto' : 'Excluir produto'}</h2><p>{(purchaseCount ?? 0) > 0 ? `Este produto possui ${purchaseCount} item(ns) no histórico. Por segurança, ele será arquivado e deixará de aparecer em novas compras, mas o histórico continuará intacto.` : 'Este produto ainda não possui compras registradas e pode ser excluído definitivamente.'}</p></div>
          <form action={deleteOrArchiveProduct}><input type="hidden" name="product_id" value={product.id} /><button className="danger-button" type="submit">{(purchaseCount ?? 0) > 0 ? 'Arquivar produto' : 'Excluir produto'}</button></form>
        </section>
      </section>
    </main>
  )
}
