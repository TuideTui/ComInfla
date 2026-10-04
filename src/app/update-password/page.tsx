import { updatePassword } from '../actions'
import { AuthShell, Notice } from '@/components/auth-shell'

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  return (
    <AuthShell>
      <div className="auth-card premium-card reveal">
        <div className="auth-heading"><h1>Defina uma nova senha</h1><p>Escolha uma senha com pelo menos 8 caracteres.</p></div>
        <Notice error={params.error} />
        <form action={updatePassword} className="form-stack">
          <label><span>Nova senha</span><input name="password" type="password" autoComplete="new-password" required /></label>
          <label><span>Confirmar senha</span><input name="confirm_password" type="password" autoComplete="new-password" required /></label>
          <button className="button button-primary button-full" type="submit">Salvar nova senha</button>
        </form>
      </div>
    </AuthShell>
  )
}
