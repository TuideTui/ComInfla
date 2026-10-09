import Link from 'next/link'
import { AuthShell, Notice } from '@/components/auth-shell'
import { LoginForm } from '@/components/login-form'

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="auth-card premium-card reveal auth-transition-card">
        <div className="auth-heading"><h1>Bem-vindo de volta</h1><p>Entre para acompanhar preços e sua inflação pessoal.</p></div>
        <Notice error={params.error} message={params.message} />
        <LoginForm next={params.next ?? '/app'} />
        <p className="auth-switch">Ainda não tem conta? <Link href="/signup">Criar conta</Link></p>
        <p className="auth-footnote">Seus dados ficam protegidos por autenticação e políticas de acesso no banco.</p>
      </div>
    </AuthShell>
  )
}
