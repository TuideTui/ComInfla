import Link from 'next/link'
import { signup } from '../actions'
import { AuthShell, Notice } from '@/components/auth-shell'

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="auth-card premium-card auth-card-wide reveal">
        <div className="auth-heading"><h1>Crie sua conta</h1><p>Comece a construir seu histórico de preços e custo de vida.</p></div>
        <Notice error={params.error} />
        <form action={signup} className="form-stack">
          <label><span>Nome</span><input name="full_name" type="text" autoComplete="name" placeholder="Seu nome" required /></label>
          <label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required /></label>
          <div className="two-cols">
            <label><span>Senha</span><input name="password" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" required /></label>
            <label><span>Confirmar senha</span><input name="confirm_password" type="password" autoComplete="new-password" placeholder="Repita a senha" required /></label>
          </div>
          <button className="button button-primary button-full" type="submit">Criar conta</button>
        </form>
        <p className="auth-switch">Já possui conta? <Link href="/login">Entrar</Link></p>
      </div>
    </AuthShell>
  )
}
