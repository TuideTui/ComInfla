import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeLocalPath(value: string | null, fallback = '/app') {
  return value?.startsWith('/') && !value.startsWith('//') ? value : fallback
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeLocalPath(url.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=Não%20foi%20possível%20confirmar%20sua%20sessão.', url.origin)
  )
}
