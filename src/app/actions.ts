'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeMessage(message: string) {
  return encodeURIComponent(message)
}

function safeLocalPath(value: string, fallback = '/app') {
  return value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')

  const headerStore = await headers()
  const origin = headerStore.get('origin')
  return origin?.replace(/\/$/, '') ?? 'http://localhost:3000'
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/app')

  if (!email || !password) {
    redirect(`/login?error=${safeMessage('Preencha email e senha.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/login?error=${safeMessage('Email ou senha inválidos.')}`)
  }

  redirect(safeLocalPath(next))
}

export async function signup(formData: FormData) {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (!fullName || !email || !password) {
    redirect(`/signup?error=${safeMessage('Preencha todos os campos obrigatórios.')}`)
  }

  if (password.length < 8) {
    redirect(`/signup?error=${safeMessage('A senha precisa ter pelo menos 8 caracteres.')}`)
  }

  if (password !== confirmPassword) {
    redirect(`/signup?error=${safeMessage('As senhas não coincidem.')}`)
  }

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) {
    redirect(`/signup?error=${safeMessage(error.message)}`)
  }

  redirect(`/verify-email?email=${safeMessage(email)}`)
}

export async function resendConfirmation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    redirect(`/verify-email?error=${safeMessage('Informe o email usado no cadastro.')}`)
  }

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  const emailParam = safeMessage(email)

  if (error) {
    const rateLimited = /rate|security purposes|seconds/i.test(error.message)
    const message = rateLimited
      ? 'Aguarde o contador terminar antes de solicitar um novo envio.'
      : 'Não foi possível reenviar o email agora. Tente novamente em instantes.'

    redirect(`/verify-email?email=${emailParam}&error=${safeMessage(message)}`)
  }

  redirect(
    `/verify-email?email=${emailParam}&message=${safeMessage('Novo email de confirmação solicitado. Confira também a caixa de spam e lixo eletrônico.')}`
  )
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect(`/forgot-password?error=${safeMessage('Informe seu email.')}`)

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
  })

  if (error) {
    redirect(`/forgot-password?error=${safeMessage(error.message)}`)
  }

  redirect(`/forgot-password?message=${safeMessage('Se o email estiver cadastrado, você receberá as instruções de recuperação.')}`)
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (password.length < 8) {
    redirect(`/update-password?error=${safeMessage('A senha precisa ter pelo menos 8 caracteres.')}`)
  }

  if (password !== confirmPassword) {
    redirect(`/update-password?error=${safeMessage('As senhas não coincidem.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`/update-password?error=${safeMessage(error.message)}`)
  }

  redirect(`/app?message=${safeMessage('Senha alterada com sucesso.')}`)
}
