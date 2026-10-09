'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { login } from '@/app/actions'

export function LoginForm({ next }: { next: string }) {
  const submittingAfterAnimation = useRef(false)
  const timer = useRef<number | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => () => {
    document.body.classList.remove('auth-route-leaving')
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submittingAfterAnimation.current) return

    event.preventDefault()
    const form = event.currentTarget
    setLeaving(true)
    document.body.classList.add('auth-route-leaving')

    timer.current = window.setTimeout(() => {
      submittingAfterAnimation.current = true
      form.requestSubmit()
    }, 280)
  }

  return (
    <form action={login} className="form-stack" onSubmit={handleSubmit}>
      <input type="hidden" name="next" value={next} />
      <label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required /></label>
      <label><span>Senha</span><input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required /></label>
      <div className="form-row"><span /><Link href="/forgot-password" className="text-link small">Esqueci minha senha</Link></div>
      <button className="button button-primary button-full" type="submit" disabled={leaving}>{leaving ? 'Entrando…' : 'Entrar'}</button>
    </form>
  )
}
