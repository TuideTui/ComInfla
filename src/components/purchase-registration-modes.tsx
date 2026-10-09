'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PurchaseForm } from '@/components/purchase-form'
import { ReceiptImporterV2 } from '@/components/receipt-importer-v2'

type Product = {
  id: string
  name: string
  brand?: string | null
  presentation?: string | null
  base_quantity?: number | null
  unit?: string | null
  packaging?: string | null
  subcategory?: string | null
  category_id?: string | null
  barcode?: string | null
}

type Establishment = {
  id: string
  name: string
  establishment_type?: string | null
  visit_frequency?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
}

type Mode = 'intelligent' | 'manual' | null

export function PurchaseRegistrationModes({ products, establishments }: { products: Product[]; establishments: Establishment[] }) {
  const [mode, setMode] = useState<Mode>(null)
  const readyToBuy = Boolean(products.length && establishments.length)

  return (
    <section className="purchase-mode-shell" id="registrar-compra">
      <div className="section-inline-heading purchase-mode-heading">
        <div>
          <span className="page-kicker">REGISTRAR COMPRA</span>
          <h2>Como você quer registrar?</h2>
          <p>Escolha um caminho. O ComInfla mostra apenas o fluxo que você precisa agora.</p>
        </div>
        <Link className="text-link small" href="/app/cadastrando">Gerenciar cadastros →</Link>
      </div>

      <div className="purchase-mode-grid" aria-label="Escolha como registrar a compra">
        <button type="button" className={`purchase-mode-card intelligent ${mode === 'intelligent' ? 'active' : ''}`} onClick={() => setMode('intelligent')}>
          <div className="purchase-mode-art intelligent-art" aria-hidden="true"><span className="paper"><i /><i /><i /><b>R$</b></span><span className="scan-line" /></div>
          <div className="purchase-mode-copy">
            <span className="purchase-mode-badge">RECOMENDADO</span>
            <h3>Importação inteligente</h3>
            <p>Fotografe ou envie uma nota, cupom ou comprovante. O ComInfla lê os dados e você revisa antes de salvar.</p>
            <div className="purchase-mode-features"><span>Foto, câmera ou PDF</span><span>Itens e valores editáveis</span><span>Cria produtos novos só após confirmação</span></div>
          </div>
          <span className="purchase-mode-action">{mode === 'intelligent' ? 'Selecionado' : 'Usar importação'} <b>→</b></span>
        </button>

        <button type="button" className={`purchase-mode-card manual ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
          <div className="purchase-mode-art manual-art" aria-hidden="true"><span className="manual-list"><i /><i /><i /></span><span className="manual-pencil">✎</span></div>
          <div className="purchase-mode-copy">
            <span className="purchase-mode-badge neutral">CONTROLE TOTAL</span>
            <h3>Registro manual</h3>
            <p>Preencha estabelecimento, produtos, quantidade e preço por conta própria. Ideal para compras pequenas e rápidas.</p>
            <div className="purchase-mode-features"><span>Preenchimento direto</span><span>Sem leitura automática</span><span>Ótimo para poucos itens</span></div>
          </div>
          <span className="purchase-mode-action">{mode === 'manual' ? 'Selecionado' : 'Registrar manualmente'} <b>→</b></span>
        </button>
      </div>

      {mode ? (
        <div className={`purchase-mode-active ${mode}`}>
          <div className="purchase-mode-active-head">
            <div>
              <span className="page-kicker">MODO ATUAL</span>
              <h3>{mode === 'intelligent' ? 'Importação inteligente' : 'Registro manual'}</h3>
              <p>{mode === 'intelligent' ? 'Envie a nota e revise tudo antes de cadastrar qualquer informação.' : 'Preencha somente os dados desta compra. Nada do modo automático fica na tela.'}</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setMode(null)}>Trocar modo</button>
          </div>

          {mode === 'intelligent' ? (
            <div className="purchase-mode-intelligent-panel">
              <ReceiptImporterV2 products={products as any} establishments={establishments as any} />
              <div className="purchase-mode-tip"><strong>Dica para uma leitura melhor</strong><span>Fotografe a nota inteira, com boa luz e o papel o mais reto possível. Notas longas podem ser enviadas em várias fotos.</span></div>
            </div>
          ) : readyToBuy ? (
            <div className="purchase-mode-manual-panel"><PurchaseForm products={products as any} establishments={establishments as any} /></div>
          ) : (
            <div className="setup-state purchase-mode-setup">
              <strong>Prepare sua base para o modo manual</strong>
              <p>O registro manual precisa de pelo menos um produto e um estabelecimento cadastrados. A Importação inteligente pode criar esses cadastros ao confirmar uma nota.</p>
              <div className="setup-steps"><span className={products.length ? 'done' : ''}>1. Produto {products.length ? '✓' : ''}</span><span className={establishments.length ? 'done' : ''}>2. Estabelecimento {establishments.length ? '✓' : ''}</span><span>3. Compra</span></div>
              <Link className="button button-primary setup-cta" href="/app/cadastrando">Abrir Cadastrando</Link>
            </div>
          )}
        </div>
      ) : (
        <div className="purchase-mode-empty-hint"><span>↑</span><p>Escolha um dos dois modos acima para começar. O formulário só aparece depois da sua escolha.</p></div>
      )}
    </section>
  )
}
