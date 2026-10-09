import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { DestructiveActionGuard } from '@/components/destructive-action-guard'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name,city,state,currency,locale,timezone,created_at')
    .eq('id', userId)
    .single()

  const fullName = profile?.full_name || 'Usuário'
  const firstName = fullName.split(' ')[0] || 'você'
  const email = String(claimsData?.claims?.email ?? '')

  return (
    <div className="app-shared-shell">
      <DestructiveActionGuard />
      <AppHeader
        firstName={firstName}
        account={{
          fullName,
          email,
          city: profile?.city,
          state: profile?.state,
          currency: profile?.currency,
          locale: profile?.locale,
          timezone: profile?.timezone,
          createdAt: profile?.created_at,
        }}
      />
      <div className="app-page-host">{children}</div>
    </div>
  )
}
