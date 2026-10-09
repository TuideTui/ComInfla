import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { DestructiveActionGuard } from '@/components/destructive-action-guard'
import { createClient } from '@/lib/supabase/server'

function describeDevice(userAgent: string) {
  const browser = /OPR\//i.test(userAgent)
    ? 'Opera'
    : /Edg\//i.test(userAgent)
      ? 'Microsoft Edge'
      : /Firefox\//i.test(userAgent)
        ? 'Firefox'
        : /Chrome\//i.test(userAgent)
          ? 'Chrome'
          : /Safari\//i.test(userAgent)
            ? 'Safari'
            : 'Navegador'

  const system = /Windows/i.test(userAgent)
    ? 'Windows'
    : /Android/i.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? 'iOS/iPadOS'
        : /Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'dispositivo atual'

  return `${browser} em ${system}`
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) redirect('/login')

  const [{ data: profile }, requestHeaders] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name,city,state,currency,locale,timezone,created_at')
      .eq('id', userId)
      .single(),
    headers(),
  ])

  const fullName = profile?.full_name || 'Usuário'
  const firstName = fullName.split(' ')[0] || 'você'
  const email = String(claimsData?.claims?.email ?? '')
  const currentDevice = describeDevice(requestHeaders.get('user-agent') ?? '')

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
          currentDevice,
        }}
      />
      <div className="app-page-host">{children}</div>
    </div>
  )
}
