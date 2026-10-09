'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

type PendingAction = {
  form: HTMLFormElement
  submitter: HTMLButtonElement | HTMLInputElement | null
  label: string
  title: string
  description: string
} | null

function copyFor(label: string) {
  const normalized = label.toLowerCase()
  if (normalized.includes('arquivar')) {
    return {
      title: 'Confirmar arquivamento?',
      description: 'O item deixará de aparecer nas áreas ativas da plataforma. O histórico existente será preservado quando aplicável.',
    }
  }
  return {
    title: 'Confirmar exclusão?',
    description: 'Esta ação pode remover dados definitivamente e não poderá ser desfeita. Confirme somente se deseja continuar.',
  }
}

export function DestructiveActionGuard() {
  const [pending, setPending] = useState<PendingAction>(null)

  useEffect(() => {
    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form || form.dataset.destructiveConfirmed === 'true') return

      const submitter = event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
        ? event.submitter
        : null

      if (!submitter || !submitter.matches('.danger-button, .danger-link')) return
      if (submitter.dataset.skipDestructiveGuard === 'true') return

      event.preventDefault()
      event.stopPropagation()

      const label = (submitter.textContent || submitter.value || 'Confirmar').trim()
      const copy = copyFor(label)
      setPending({ form, submitter, label, ...copy })
    }

    document.addEventListener('submit', onSubmit, true)
    return () => document.removeEventListener('submit', onSubmit, true)
  }, [])

  useEffect(() => {
    if (!pending) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending])

  if (!pending || typeof document === 'undefined') return null

  return createPortal(
    <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setPending(null) }}>
      <section className="confirm-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="global-confirm-title">
        <span className="confirm-dialog-icon">!</span>
        <div>
          <span className="page-kicker">CONFIRMAÇÃO NECESSÁRIA</span>
          <h3 id="global-confirm-title">{pending.title}</h3>
          <p>{pending.description}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="ghost-button" onClick={() => setPending(null)}>Cancelar</button>
          <button
            type="button"
            className="danger-button confirm-danger-button"
            onClick={() => {
              const { form, submitter } = pending
              setPending(null)
              form.dataset.destructiveConfirmed = 'true'
              window.requestAnimationFrame(() => {
                form.requestSubmit(submitter ?? undefined)
                window.setTimeout(() => delete form.dataset.destructiveConfirmed, 0)
              })
            }}
          >
            {pending.label || 'Confirmar'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
