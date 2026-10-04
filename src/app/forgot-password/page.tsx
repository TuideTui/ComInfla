import Link from 'next/link'
import { requestPasswordReset } from '../actions'
import { AuthShell, Notice } from '@/components/auth-shell'

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="auth-card premium-card reveal">
        <div className="auth-heading"><h1>Recuperar senha</h1><p>Enviaremos um link seguro para o seu email.</p></div>
        <Notice error={params.error} message={params.message} />
        <form action={requestPasswordReset} className="form-stack">
          <label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required /></label>
          <button className="button button-primary button-full" type="submit">Enviar instruções</button>
        </form>
        <p className="auth-switch"><Link href="/login">← Voltar para o login</Link></p>
      </div>
    </AuthShell>
  )
}
