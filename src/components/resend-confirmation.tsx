'use client'

import { useEffect, useMemo, useState } from 'react'
import { resendConfirmation } from '@/app/actions'

const COOLDOWN_SECONDS = 60

function formatTime(seconds: number) {
  const value = Math.max(0, seconds)
  const minutes = Math.floor(value / 60)
  const secs = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function ResendConfirmation({ email }: { email: string }) {
  const storageKey = useMemo(() => `cominfla:confirmation-resend:${email.toLowerCase()}`, [email])
  const [remaining, setRemaining] = useState(COOLDOWN_SECONDS)

  useEffect(() => {
    const now = Date.now()
    const storedUntil = Number(window.localStorage.getItem(storageKey) ?? 0)
    const cooldownUntil = storedUntil > now ? storedUntil : now + COOLDOWN_SECONDS * 1000

    if (storedUntil <= now) {
      window.localStorage.setItem(storageKey, String(cooldownUntil))
    }

    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setRemaining(seconds)
    }

    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [storageKey])

  function restartCooldown() {
    const cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000
    window.localStorage.setItem(storageKey, String(cooldownUntil))
    setRemaining(COOLDOWN_SECONDS)
  }

  return (
    <form action={resendConfirmation} className="resend-confirmation" onSubmit={restartCooldown}>
      <input type="hidden" name="email" value={email} />
      <button
        className="button button-outline button-full"
        type="submit"
        disabled={remaining > 0}
      >
        {remaining > 0 ? `Reenviar em ${formatTime(remaining)}` : 'Reenviar confirmação'}
      </button>
      <p className="resend-hint">
        Para evitar envios repetidos, um novo email só pode ser solicitado após o contador terminar.
      </p>
    </form>
  )
}
