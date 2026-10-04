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

export function ResendConfirmation({ email, startCooldown = false }: { email: string; startCooldown?: boolean }) {
  const storageKey = useMemo(() => `cominfla:confirmation-resend:${email.toLowerCase()}`, [email])
  const [remaining, setRemaining] = useState(startCooldown ? COOLDOWN_SECONDS : 0)

  useEffect(() => {
    const now = Date.now()
    const storedUntil = Number(window.localStorage.getItem(storageKey) ?? 0)
    let cooldownUntil = storedUntil > now ? storedUntil : 0

    if (!cooldownUntil && startCooldown) {
      cooldownUntil = now + COOLDOWN_SECONDS * 1000
      window.localStorage.setItem(storageKey, String(cooldownUntil))
    }

    const updateRemaining = () => {
      const seconds = cooldownUntil
        ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
        : 0
      setRemaining(seconds)

      if (seconds === 0 && cooldownUntil) {
        window.localStorage.removeItem(storageKey)
      }
    }

    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [startCooldown, storageKey])

  function restartCooldown() {
    const cooldownUntil = Date.now() + COOLDOWN_SECONDS * 1000
    window.localStorage.setItem(storageKey, String(cooldownUntil))
    setRemaining(COOLDOWN_SECONDS)
  }

  const waiting = remaining > 0

  return (
    <form action={resendConfirmation} className="form-stack" onSubmit={restartCooldown}>
      <input type="hidden" name="email" value={email} />
      <button
        className="button button-outline button-full"
        type="submit"
        disabled={waiting}
        style={{
          opacity: waiting ? 0.48 : 1,
          cursor: waiting ? 'not-allowed' : 'pointer',
          transform: waiting ? 'none' : undefined,
        }}
      >
        {waiting ? `Reenviar em ${formatTime(remaining)}` : 'Reenviar confirmação'}
      </button>
      <p style={{ color: '#77736c', fontSize: 12, lineHeight: 1.5, margin: '-4px 2px 0', textAlign: 'center' }}>
        Para evitar envios repetidos, um novo email só pode ser solicitado após o contador terminar.
      </p>
    </form>
  )
}
