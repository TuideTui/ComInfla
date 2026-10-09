'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
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

async function currentUserId() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  return { supabase, userId: claimsData?.claims?.sub as string | undefined }
}

async function removeUserMedia(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const bucket = supabase.storage.from('cominfla-media')

  for (const folder of ['products', 'establishments']) {
    let offset = 0
    while (true) {
      const { data, error } = await bucket.list(`${userId}/${folder}`, { limit: 100, offset })
      if (error) return error
      const files = data ?? []
      if (!files.length) break

      const paths = files.filter((item) => item.name && item.id).map((item) => `${userId}/${folder}/${item.name}`)
      if (paths.length) {
        const { error: removeError } = await bucket.remove(paths)
        if (removeError) return removeError
      }

      if (files.length < 100) break
      offset += files.length
    }
  }

  return null
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/app')
  if (!email || !password) redirect(`/login?error=${safeMessage('Preencha email e senha.')}`)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === 'email_not_confirmed') {
      redirect(`/verify-email?email=${safeMessage(email)}&error=${safeMessage('Seu email ainda não foi confirmado. Você pode solicitar uma nova confirmação abaixo.')}`)
    }
    redirect(`/login?error=${safeMessage('Email ou senha inválidos.')}`)
  }
  redirect(safeLocalPath(next))
}

export async function signup(formData: FormData) {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (!fullName || !email || !password) redirect(`/signup?error=${safeMessage('Preencha todos os campos obrigatórios.')}`)
  if (password.length < 8) redirect(`/signup?error=${safeMessage('A senha precisa ter pelo menos 8 caracteres.')}`)
  if (password !== confirmPassword) redirect(`/signup?error=${safeMessage('As senhas não coincidem.')}`)

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${siteUrl}/auth/callback` },
  })
  if (error) redirect(`/signup?error=${safeMessage(error.message)}`)
  redirect(`/verify-email?email=${safeMessage(email)}&cooldown=1`)
}

export async function resendConfirmation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect(`/verify-email?error=${safeMessage('Informe o email usado no cadastro.')}`)

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${siteUrl}/auth/callback` } })
  const emailParam = safeMessage(email)

  if (error) {
    const rateLimited = /rate|security purposes|seconds/i.test(error.message)
    const message = rateLimited ? 'Aguarde o contador terminar antes de solicitar um novo envio.' : 'Não foi possível reenviar o email agora. Tente novamente em instantes.'
    redirect(`/verify-email?email=${emailParam}&cooldown=1&error=${safeMessage(message)}`)
  }

  redirect(`/verify-email?email=${emailParam}&cooldown=1&message=${safeMessage('Novo email de confirmação solicitado. Confira também a caixa de spam e lixo eletrônico.')}`)
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect(`/forgot-password?error=${safeMessage('Informe seu email.')}`)

  const siteUrl = await getSiteUrl()
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/auth/callback?next=/update-password` })
  if (error) redirect(`/forgot-password?error=${safeMessage(error.message)}`)
  redirect(`/forgot-password?message=${safeMessage('Se o email estiver cadastrado, você receberá as instruções de recuperação.')}`)
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')
  if (password.length < 8) redirect(`/update-password?error=${safeMessage('A senha precisa ter pelo menos 8 caracteres.')}`)
  if (password !== confirmPassword) redirect(`/update-password?error=${safeMessage('As senhas não coincidem.')}`)

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) redirect(`/update-password?error=${safeMessage(error.message)}`)
  redirect(`/app?message=${safeMessage('Senha alterada com sucesso.')}`)
}

export type AccountActionResult = { ok: boolean; message: string }

export async function updateAccountProfile(formData: FormData): Promise<AccountActionResult> {
  const { supabase, userId } = await currentUserId()
  if (!userId) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' }

  const fullName = String(formData.get('full_name') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim().toUpperCase().slice(0, 2)
  if (fullName.length < 2 || fullName.length > 120) return { ok: false, message: 'Informe um nome válido.' }

  const { error } = await supabase.from('profiles').update({ full_name: fullName, city: city || null, state: state || null, updated_at: new Date().toISOString() }).eq('id', userId)
  if (error) return { ok: false, message: 'Não foi possível salvar o perfil agora.' }

  revalidatePath('/app', 'layout')
  return { ok: true, message: 'Perfil atualizado.' }
}

export async function clearMyCominflaData(): Promise<AccountActionResult> {
  const { supabase, userId } = await currentUserId()
  if (!userId) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' }

  const mediaError = await removeUserMedia(supabase, userId)
  if (mediaError) return { ok: false, message: 'Não foi possível remover suas imagens. Nenhum outro dado foi apagado.' }

  const { error } = await supabase.rpc('clear_my_cominfla_data')
  if (error) return { ok: false, message: 'Não foi possível apagar seus dados agora.' }

  revalidatePath('/app', 'layout')
  return { ok: true, message: 'Seus dados da plataforma foram apagados. Sua conta continua ativa.' }
}

export async function deleteMyCominflaAccount(): Promise<AccountActionResult> {
  const { supabase, userId } = await currentUserId()
  if (!userId) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' }

  const mediaError = await removeUserMedia(supabase, userId)
  if (mediaError) return { ok: false, message: 'Não foi possível remover suas imagens. A conta não foi excluída.' }

  const { error } = await supabase.rpc('delete_my_cominfla_account')
  if (error) return { ok: false, message: 'Não foi possível excluir sua conta agora.' }

  await supabase.auth.signOut()
  return { ok: true, message: 'Conta excluída.' }
}
