'use client'

import { useState } from 'react'
import type { InsightLike } from '@/lib/insights'
import { insightDescription } from '@/lib/insights'

export function PurchaseInsightModal({ insights }: { insights: InsightLike[] }) {
  const [open, setOpen] = useState(insights.length > 0)
  if (!open || !insights.length) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setOpen(false)
    }}>
      <section className="premium-card insight-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-insights-title">
        <button className="modal-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
        <span className="page-kicker">COMPRA ANALISADA</span>
        <h2 id="purchase-insights-title">{insights.length === 1 ? 'Um insight para você' : `${insights.length} insights para você`}</h2>
        <p className="modal-lead">O novo preço já foi comparado com o seu histórico. Essas informações também ficam vinculadas à compra.</p>
        <div className="modal-insight-list">
          {insights.map((insight, index) => (
            <article className={`insight-item ${insight.severity ?? ''}`} key={`${insight.title}-${index}`}>
              <strong>{insight.title}</strong>
              <p>{insightDescription(insight)}</p>
            </article>
          ))}
        </div>
        <button className="button button-primary button-full" type="button" onClick={() => setOpen(false)}>Entendi</button>
      </section>
    </div>
  )
}
