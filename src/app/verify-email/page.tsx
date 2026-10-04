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
  const startCooldown = params.cooldown === '1'

  return (
    <AuthShell>
      <div className="auth-card premium-card reveal">
        <div
          aria-hidden="true"
          style={{
            width: 54,
            height: 54,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 16,
            border: '1px solid rgba(214,169,79,.45)',
            background: 'rgba(214,169,79,.08)',
            color: '#f0cf87',
            fontSize: 24,
            marginBottom: 24,
          }}
        >
          ✦
        </div>

        <div className="auth-heading">
          <h1>Confirme seu email</h1>
          <p>
            {email
              ? <>Enviamos uma confirmação para <strong style={{ color: '#f0cf87' }}>{maskEmail(email)}</strong>. Abra a mensagem para ativar sua conta.</>
              : 'Abra o email usado no cadastro e confirme sua conta para continuar.'}
          </p>
        </div>

        <Notice error={params.error} message={params.message} />

        <div
          style={{
            padding: '16px 18px',
            borderRadius: 14,
            background: '#101011',
            border: '1px solid #2a2927',
            marginBottom: 20,
          }}
        >
          <strong style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Não encontrou a mensagem?</strong>
          <p style={{ color: '#9d9a94', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Confira também Spam, Lixo Eletrônico e a aba Outros do seu provedor de email.
          </p>
        </div>

        {email ? (
          <ResendConfirmation email={email} startCooldown={startCooldown} />
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
