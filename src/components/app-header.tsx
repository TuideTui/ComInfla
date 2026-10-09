'use client'

import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, useTransition, type FormEvent, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Brand } from './brand'
import { clearMyCominflaData, deleteMyCominflaAccount, updateAccountProfile } from '@/app/actions'

type ActiveSection = 'principal' | 'cadastrando' | 'comprando' | 'analises' | 'comparar' | 'mapa' | 'fechamento'
type AccountSection = 'profile' | 'plan' | 'security' | 'data'

export type AccountProfile = {
  fullName: string
  email: string
  city?: string | null
  state?: string | null
  currency?: string | null
  locale?: string | null
  timezone?: string | null
  createdAt?: string | null
}

const navItems: Array<{ key: ActiveSection; label: string; href: string }> = [
  { key: 'principal', label: 'Principal', href: '/app' },
  { key: 'cadastrando', label: 'Cadastrando', href: '/app/cadastrando' },
  { key: 'comprando', label: 'Comprando', href: '/app/comprando' },
  { key: 'analises', label: 'Análises', href: '/app/analises' },
  { key: 'comparar', label: 'Comparar', href: '/app/comparar' },
  { key: 'mapa', label: 'Mapa', href: '/app/mapa' },
  { key: 'fechamento', label: 'Fechamento', href: '/app/fechamento' },
]

function sectionFromPath(pathname: string): ActiveSection {
  if (pathname.startsWith('/app/cadastrando')) return 'cadastrando'
  if (pathname.startsWith('/app/comprando')) return 'comprando'
  if (pathname.startsWith('/app/analises')) return 'analises'
  if (pathname.startsWith('/app/comparar')) return 'comparar'
  if (pathname.startsWith('/app/mapa')) return 'mapa'
  if (pathname.startsWith('/app/fechamento')) return 'fechamento'
  return 'principal'
}

function formatMemberSince(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(value))
}

function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  phrase,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  phrase?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open || typeof document === 'undefined') return null
  const enabled = !phrase || typed.trim().toUpperCase() === phrase.toUpperCase()

  return createPortal(
    <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onCancel() }}>
      <section className="confirm-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <span className="confirm-dialog-icon">!</span>
        <div>
          <span className="page-kicker">CONFIRMAÇÃO NECESSÁRIA</span>
          <h3 id="confirm-dialog-title">{title}</h3>
          <p>{description}</p>
        </div>
        {phrase ? (
          <label className="confirm-phrase-field">
            <span>Digite <b>{phrase}</b> para continuar</span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus autoComplete="off" />
          </label>
        ) : null}
        <div className="confirm-dialog-actions">
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="danger-button confirm-danger-button" onClick={onConfirm} disabled={!enabled || busy}>{busy ? 'Aguarde…' : confirmLabel}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function ConfirmSubmitButton({
  label,
  title,
  description,
  confirmLabel,
  className = 'danger-button',
}: {
  label: string
  title: string
  description: string
  confirmLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          formRef.current = event.currentTarget.form
          setOpen(true)
        }}
      >
        {label}
      </button>
      <ConfirmationDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel ?? label}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          window.requestAnimationFrame(() => formRef.current?.requestSubmit())
        }}
      />
    </>
  )
}

function AccountPanel({ account, initial }: { account: AccountProfile; initial: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<AccountSection>('profile')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState<'clear' | 'delete' | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('account-panel-open')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirm) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('account-panel-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, confirm])

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setNotice(null)
    startTransition(async () => {
      const result = await updateAccountProfile(formData)
      setNotice({ ok: result.ok, text: result.message })
      if (result.ok) router.refresh()
    })
  }

  function runClearData() {
    setNotice(null)
    startTransition(async () => {
      const result = await clearMyCominflaData()
      setConfirm(null)
      setNotice({ ok: result.ok, text: result.message })
      if (result.ok) router.refresh()
    })
  }

  function runDeleteAccount() {
    setNotice(null)
    startTransition(async () => {
      const result = await deleteMyCominflaAccount()
      if (!result.ok) {
        setConfirm(null)
        setNotice({ ok: false, text: result.message })
        return
      }
      window.location.assign('/')
    })
  }

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div className="account-settings-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) setOpen(false) }}>
      <section className="account-settings-panel" role="dialog" aria-modal="true" aria-label="Configurações da conta">
        <aside className="account-settings-sidebar">
          <div className="account-sidebar-user">
            <span className="account-avatar-large">{initial}</span>
            <div><strong>{account.fullName}</strong><small>{account.email}</small></div>
          </div>

          <nav aria-label="Configurações da conta">
            <button className={section === 'profile' ? 'active' : ''} onClick={() => { setSection('profile'); setNotice(null) }}><span>Perfil</span><small>Dados pessoais</small></button>
            <button className={section === 'plan' ? 'active' : ''} onClick={() => { setSection('plan'); setNotice(null) }}><span>Seu plano</span><small>ComInfla Essencial</small></button>
            <button className={section === 'security' ? 'active' : ''} onClick={() => { setSection('security'); setNotice(null) }}><span>Segurança</span><small>Acesso e senha</small></button>
            <button className={section === 'data' ? 'active' : ''} onClick={() => { setSection('data'); setNotice(null) }}><span>Política de dados</span><small>Privacidade e exclusão</small></button>
          </nav>

          <form className="account-signout-form" action="/auth/signout" method="post">
            <button className="account-signout-button" type="submit">Sair do ComInfla</button>
          </form>
        </aside>

        <div className="account-settings-content">
          <header className="account-settings-header">
            <div><span className="page-kicker">CONFIGURAÇÕES</span><h2>{section === 'profile' ? 'Seu perfil' : section === 'plan' ? 'Seu plano' : section === 'security' ? 'Segurança' : 'Privacidade e dados'}</h2></div>
            <button className="account-settings-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar configurações">×</button>
          </header>

          {notice ? <div className={`account-settings-notice ${notice.ok ? 'success' : 'error'}`}>{notice.text}</div> : null}

          {section === 'profile' ? (
            <div className="account-section-body">
              <div className="account-section-intro"><h3>Informações da conta</h3><p>Esses dados ajudam a personalizar a experiência do ComInfla. Seu email de acesso é exibido apenas para referência.</p></div>
              <form className="account-profile-form" onSubmit={submitProfile}>
                <label><span>Nome</span><input name="full_name" defaultValue={account.fullName} maxLength={120} required /></label>
                <label><span>Email</span><input value={account.email} disabled readOnly /><small>O email de acesso não é alterado por esta tela.</small></label>
                <div className="account-form-grid">
                  <label><span>Cidade</span><input name="city" defaultValue={account.city ?? ''} maxLength={120} placeholder="São Paulo" /></label>
                  <label><span>UF</span><input name="state" defaultValue={account.state ?? ''} maxLength={2} placeholder="SP" /></label>
                </div>
                <div className="account-profile-meta">
                  <span><small>Membro desde</small><b>{formatMemberSince(account.createdAt)}</b></span>
                  <span><small>Moeda</small><b>{account.currency || 'BRL'}</b></span>
                  <span><small>Fuso</small><b>{account.timezone || 'America/Sao_Paulo'}</b></span>
                </div>
                <div className="account-form-actions"><button className="button button-primary" type="submit" disabled={isPending}>{isPending ? 'Salvando…' : 'Salvar perfil'}</button></div>
              </form>
            </div>
          ) : null}

          {section === 'plan' ? (
            <div className="account-section-body">
              <div className="account-section-intro"><h3>ComInfla Essencial</h3><p>Seu plano atual inclui os recursos disponíveis hoje na plataforma.</p></div>
              <div className="account-plan-card current"><div><span>PLANO ATUAL</span><h3>Essencial</h3><p>Cadastros, compras, análises, comparação, mapa e fechamento.</p></div><b>Ativo</b></div>
              <div className="account-plan-card future"><div><span>EM PLANEJAMENTO</span><h3>ComInfla Plus</h3><p>No futuro, recursos avançados podem incluir automações, importação inteligente de comprovantes e análises ampliadas.</p></div><b>Futuro</b></div>
              <p className="account-muted-note">Nenhuma cobrança ou assinatura paga está ativa hoje.</p>
            </div>
          ) : null}

          {section === 'security' ? (
            <div className="account-section-body">
              <div className="account-section-intro"><h3>Acesso à sua conta</h3><p>O acesso é protegido pela autenticação do Supabase e pelos controles de acesso da plataforma.</p></div>
              <div className="account-security-row"><div><strong>Email de acesso</strong><span>{account.email}</span></div><span className="account-security-state">Verificado</span></div>
              <div className="account-security-row"><div><strong>Senha</strong><span>Use a recuperação de senha caso queira definir uma nova senha.</span></div><Link href="/forgot-password" className="ghost-button" onClick={() => setOpen(false)}>Alterar senha</Link></div>
              <div className="account-security-note"><strong>Isolamento dos dados</strong><p>As tabelas pessoais usam políticas de acesso para que cada sessão autenticada trabalhe somente com os dados permitidos ao próprio usuário.</p></div>
            </div>
          ) : null}

          {section === 'data' ? (
            <div className="account-section-body account-data-section">
              <div className="account-section-intro"><h3>Nossa responsabilidade com seus dados</h3><p>O ComInfla precisa dos registros que você adiciona para construir histórico de preços e análises pessoais. Esses dados devem ser usados somente para prestar as funções da plataforma e permanecer vinculados à sua conta.</p></div>
              <div className="data-policy-grid">
                <article><strong>O que armazenamos</strong><p>Perfil, produtos, estabelecimentos, compras, preços, insights, fechamentos e imagens que você decidir enviar.</p></article>
                <article><strong>Como protegemos</strong><p>Autenticação, políticas de acesso no banco e armazenamento privado para as imagens cadastradas.</p></article>
                <article><strong>Compartilhamento</strong><p>Seus registros pessoais não são publicados para outros usuários por padrão. Qualquer recurso agregado futuro deverá preservar a privacidade individual.</p></article>
                <article><strong>Seu controle</strong><p>Você pode manter a conta e apagar seus dados de uso, ou excluir completamente a conta e os dados associados.</p></article>
              </div>
              <div className="account-data-warning"><strong>Zona de exclusão</strong><p>As ações abaixo são irreversíveis. Compras, históricos e análises apagados não poderão ser recuperados pela plataforma.</p></div>
              <div className="account-danger-actions">
                <div><strong>Apagar dados da plataforma</strong><p>Remove compras, produtos, estabelecimentos, históricos, insights, fechamentos e imagens. Seu login e perfil permanecem ativos.</p></div>
                <button className="danger-button secondary-danger" type="button" onClick={() => setConfirm('clear')}>Apagar meus dados</button>
              </div>
              <div className="account-danger-actions critical">
                <div><strong>Excluir minha conta</strong><p>Remove os dados da plataforma e também sua conta de autenticação. Ao concluir, você será desconectado e retornará à página inicial.</p></div>
                <button className="danger-button" type="button" onClick={() => setConfirm('delete')}>Excluir minha conta</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <ConfirmationDialog
        open={confirm === 'clear'}
        title="Apagar todos os dados da plataforma?"
        description="Sua conta continuará existindo, mas compras, produtos, estabelecimentos, históricos, insights, fechamentos e imagens serão removidos definitivamente."
        confirmLabel="Sim, apagar meus dados"
        busy={isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={runClearData}
      />
      <ConfirmationDialog
        open={confirm === 'delete'}
        title="Excluir sua conta definitivamente?"
        description="Esta ação remove sua conta e os dados associados. Não será possível recuperar o histórico depois da exclusão."
        confirmLabel="Excluir conta"
        phrase="EXCLUIR"
        busy={isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={runDeleteAccount}
      />
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button className="avatar-button" type="button" title="Configurações da conta" aria-label="Abrir configurações da conta" onClick={() => setOpen(true)}>{initial}</button>
      {panel}
    </>
  )
}

export function AppHeader({ active: activeProp, firstName, account }: { active?: ActiveSection; firstName: string; account?: AccountProfile }) {
  const pathname = usePathname()
  const router = useRouter()
  const active = activeProp ?? sectionFromPath(pathname)
  const initial = (firstName || 'U').slice(0, 1).toUpperCase()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const navigationTimer = useRef<number | null>(null)
  const safetyTimer = useRef<number | null>(null)

  useEffect(() => {
    navItems.forEach((item) => router.prefetch(item.href))
  }, [router])

  useEffect(() => {
    setPendingHref(null)
    document.body.classList.remove('app-route-leaving')
    document.body.classList.add('app-route-arrived')
    const arrivedTimer = window.setTimeout(() => document.body.classList.remove('app-route-arrived'), 650)

    if (navigationTimer.current) { window.clearTimeout(navigationTimer.current); navigationTimer.current = null }
    if (safetyTimer.current) { window.clearTimeout(safetyTimer.current); safetyTimer.current = null }
    return () => window.clearTimeout(arrivedTimer)
  }, [pathname])

  useEffect(() => () => {
    document.body.classList.remove('app-route-leaving', 'app-route-arrived')
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current)
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current)
  }, [])

  function beginNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || pathname === href || pendingHref) return

    event.preventDefault()
    setPendingHref(href)
    document.body.classList.remove('app-route-arrived')
    document.body.classList.add('app-route-leaving')

    navigationTimer.current = window.setTimeout(() => router.push(href), 260)
    safetyTimer.current = window.setTimeout(() => {
      setPendingHref(null)
      document.body.classList.remove('app-route-leaving')
    }, 5000)
  }

  return (
    <header className="app-header premium-card app-header-persistent">
      <Brand href="/app" className="app-brand" />
      <nav className="app-nav" aria-label="Navegação da plataforma">
        {navItems.map((item) => (
          <Link key={item.key} className={`${active === item.key ? 'active' : ''}${pendingHref === item.href ? ' pending' : ''}`} href={item.href} prefetch onClick={(event) => beginNavigation(event, item.href)}>{item.label}</Link>
        ))}
      </nav>
      {account ? <AccountPanel account={account} initial={initial} /> : <span className="avatar-button avatar-static">{initial}</span>}
    </header>
  )
}
