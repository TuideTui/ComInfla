import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] || 'você'

  return (
    <div className="app-shared-shell">
      <AppHeader firstName={firstName} />
      <div className="app-page-host">{children}</div>
    </div>
  )
}
