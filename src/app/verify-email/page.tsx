import Link from 'next/link'
import { AuthShell, Notice } from '@/components/auth-shell'
import { ResendConfirmation } from '@/components/resend-confirmation'

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email

  const visible = local.slice(0, Math.min(2, local.length))
  const hidden = '*'.repeat(Math.max(3, local.length - visible.length))
  return `${visible}${hidden}@${domain}`
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const email = params.email?.trim() ?? ''

  return (
    <AuthShell>
      <div className="auth-card premium-card reveal verify-card">
        <div className="verification-icon" aria-hidden="true">✦</div>
        <div className="auth-heading verify-heading">
          <h1>Confirme seu email</h1>
          <p>
            {email
              ? <>Enviamos uma confirmação para <strong>{maskEmail(email)}</strong>. Abra a mensagem para ativar sua conta.</>
              : 'Abra o email usado no cadastro e confirme sua conta para continuar.'}
          </p>
        </div>

        <Notice error={params.error} message={params.message} />

        <div className="verify-help">
          <span>Não encontrou a mensagem?</span>
          <p>Confira também Spam, Lixo Eletrônico e a aba Outros do seu provedor de email.</p>
        </div>

        {email ? (
          <ResendConfirmation email={email} />
        ) : (
          <Link href="/signup" className="button button-outline button-full">Voltar ao cadastro</Link>
        )}

        <p className="auth-switch">
          Já confirmou? <Link href="/login">Ir para o login</Link>
        </p>
      </div>
    </AuthShell>
  )
}
