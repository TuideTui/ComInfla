'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type RegistrationModalProps = {
  kind: 'product' | 'establishment'
  kicker: string
  title: string
  description: string
  children: ReactNode
  initialOpen?: boolean
}

function ProductIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M22 8h20v8l5 7v30a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3V23l5-7V8Z" />
      <path d="M22 16h20M17 27h30M24 36h16M24 44h16" />
    </svg>
  )
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M11 24h42l-4-13H15l-4 13Z" />
      <path d="M12 24v29h40V24M7 53h50v5H7z" />
      <path d="M18 24v5a6 6 0 0 0 12 0v-5M30 24v5a6 6 0 0 0 12 0v-5M42 24v5a6 6 0 0 0 10 3" />
      <path d="M20 38h10v15M37 37h10v9H37z" />
    </svg>
  )
}

export function RegistrationModal({ kind, kicker, title, description, children, initialOpen = false }: RegistrationModalProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const titleId = useId()

  useEffect(() => {
    setMounted(true)
    const requestedKind = new URLSearchParams(window.location.search).get('open')
    if (initialOpen || requestedKind === kind) setOpen(true)
  }, [initialOpen, kind])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('registration-modal-open')

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.classList.remove('registration-modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const modal = open && mounted ? createPortal(
    <div
      className="registration-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false)
      }}
    >
      <section
        className={`premium-card registration-modal registration-modal-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="registration-modal-header">
          <div className="registration-modal-heading">
            <span className="registration-modal-icon">{kind === 'product' ? <ProductIcon /> : <StoreIcon />}</span>
            <div>
              <span className="page-kicker">{kicker}</span>
              <h2 id={titleId}>{title}</h2>
              <p>{description}</p>
            </div>
          </div>
          <button className="registration-modal-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar cadastro">×</button>
        </header>
        <div className="registration-modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button className={`registration-launch-card ${kind}`} type="button" onClick={() => setOpen(true)}>
        <span className="registration-launch-icon">{kind === 'product' ? <ProductIcon /> : <StoreIcon />}</span>
        <span className="registration-launch-copy">
          <small>{kicker}</small>
          <strong>{title}</strong>
          <em>{description}</em>
        </span>
        <span className="registration-launch-action" aria-hidden="true">+</span>
      </button>
      {modal}
    </>
  )
}
