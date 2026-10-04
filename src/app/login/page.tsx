import Link from 'next/link'
import { login } from '../actions'
import { AuthShell, Notice } from '@/components/auth-shell'

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="auth-card premium-card reveal">
        <div className="auth-heading"><h1>Bem-vindo de volta</h1><p>Entre para acompanhar preços e sua inflação pessoal.</p></div>
        <Notice error={params.error} message={params.message} />
        <form action={login} className="form-stack">
          <input type="hidden" name="next" value={params.next ?? '/app'} />
          <label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required /></label>
          <label><span>Senha</span><input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required /></label>
          <div className="form-row"><span /><Link href="/forgot-password" className="text-link small">Esqueci minha senha</Link></div>
          <button className="button button-primary button-full" type="submit">Entrar</button>
        </form>
        <p className="auth-switch">Ainda não tem conta? <Link href="/signup">Criar conta</Link></p>
        <p className="auth-footnote">Seus dados ficam protegidos por autenticação e políticas de acesso no banco.</p>
      </div>
    </AuthShell>
  )
}
