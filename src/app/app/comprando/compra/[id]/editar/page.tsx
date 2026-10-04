import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { PurchaseForm } from '@/components/purchase-form'

export default async function EditPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: products }, { data: establishments }, { data: purchase }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).single(),
    supabase.from('products').select('id,name,brand,presentation,base_quantity,unit,packaging').is('archived_at', null).order('name'),
    supabase.from('establishments').select('id,name,neighborhood,visit_frequency').is('archived_at', null).order('visit_frequency').order('name'),
    supabase.from('purchases').select('id,establishment_id,purchased_at,payment_method,notes,items:purchase_items(id,product_id,quantity,unit_price_cents,discount_cents,is_promotion,notes)').eq('id', id).single(),
  ])

  if (!purchase) notFound()
  const firstName = profile?.full_name?.split(' ')[0] || 'você'

  return (
    <main className="app-shell">
      <AppHeader active="comprando" firstName={firstName} />
      <section className="app-content narrow-content">
        <div className="dashboard-heading">
          <div><span className="page-kicker">CORREÇÃO DE HISTÓRICO</span><h1>Editar compra</h1><p>Ao salvar, os itens e insights relacionados serão calculados novamente.</p></div>
          <Link className="button button-outline" href="/app/comprando">Voltar</Link>
        </div>
        {query.error ? <div className="notice notice-error page-notice">{query.error}</div> : null}
        <section className="premium-card work-card">
          <PurchaseForm
            products={(products ?? []) as any}
            establishments={(establishments ?? []) as any}
            initial={{
              id: purchase.id,
              establishmentId: purchase.establishment_id ?? '',
              purchasedAt: purchase.purchased_at,
              paymentMethod: purchase.payment_method ?? '',
              notes: purchase.notes ?? '',
              items: (purchase.items ?? []).map((item: any) => ({
                productId: item.product_id,
                quantity: item.quantity,
                unitPriceCents: Number(item.unit_price_cents),
                discountCents: Number(item.discount_cents ?? 0),
                isPromotion: Boolean(item.is_promotion),
                notes: item.notes,
              })),
            }}
          />
        </section>
      </section>
    </main>
  )
}
