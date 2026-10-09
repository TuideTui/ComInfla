from pathlib import Path

component_path = Path('src/components/receipt-importer-v2.tsx')
source = component_path.read_text(encoding='utf-8')

old = """function dateInputToIso(value: string) {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function detectDeclaredItemCount(text: string) {
  const compact = text.replace(/\\s+/g, ' ')
  const patterns = [
    /QTD\\.?\\s*TOTAL\\s*DE\\s*ITENS\\s*[:.]?\\s*0*(\\d{1,4})/i,
    /QTD\\.?\\s*TOTAL\\s*ITENS\\s*[:.]?\\s*0*(\\d{1,4})/i,
    /TOTAL\\s*DE\\s*ITENS\\s*[:.]?\\s*0*(\\d{1,4})/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0) return value
  }
  return null
}
"""
new = """function dateInputToIso(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function detectDeclaredItemCount(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[|¦]/g, 'I')
    .toUpperCase()
  const lines = normalized.split(/\\r?\\n/).map((line) => line.replace(/\\s+/g, ' ').trim()).filter(Boolean)
  const compact = lines.join(' ')
  const patterns = [
    /QTD\\W{0,3}TOTAL(?:\\s+DE)?\\s+ITENS?\\D{0,12}([0O]*\\d{1,3})\\b/i,
    /TOTAL(?:\\s+DE)?\\s+ITENS?\\D{0,12}([0O]*\\d{1,3})\\b/i,
    /QTD\\W{0,3}TOTAL(?:\\s+DE)?\\s+(?:I|1|L)?TENS?\\D{0,12}([0O]*\\d{1,3})\\b/i,
  ]
  for (const pattern of patterns) {
    const match = compact.match(pattern)
    if (!match) continue
    const value = Number(match[1].replace(/O/g, '0'))
    if (Number.isFinite(value) && value > 0 && value <= 999) return value
  }

  const indexes = lines.map((line) => {
    const match = line.match(/^\\s*0?(\\d{1,2})\\s+(?:(?:\\d[\\dO]{5,13})\\s+)?[A-Z]/)
    return match ? Number(match[1]) : 0
  }).filter((value) => value > 0 && value <= 99)
  const unique = [...new Set(indexes)].sort((a, b) => a - b)
  if (unique.length >= 2 && unique[0] === 1) {
    const max = unique[unique.length - 1]
    const sequentialHits = unique.filter((value, index) => index === 0 || value > unique[index - 1]).length
    if (max >= 2 && sequentialHits >= Math.min(3, max)) return max
  }
  return null
}
"""
assert old in source, 'date/count block not found'
source = source.replace(old, new, 1)

old = """  const differenceCents = draft?.totalCents ? calculatedTotalCents - draft.totalCents : 0
  const newProductsCount = draft?.items.filter((item) => item.productId === NEW_VALUE).length ?? 0
"""
new = """  const differenceCents = draft?.totalCents ? calculatedTotalCents - draft.totalCents : 0
  const newProductsCount = draft?.items.filter((item) => item.productId === NEW_VALUE).length ?? 0
  const establishmentReady = Boolean(draft && draft.isNewEstablishment === false && draft.establishmentId)
  const purchaseDataReady = Boolean(establishmentReady && draft?.purchasedAt && draft?.paymentMethod)
"""
assert old in source, 'readiness insertion point not found'
source = source.replace(old, new, 1)

old = """    if (!draft.establishmentId) return setError('Escolha o estabelecimento onde a compra foi realizada.')
    if (!draft.purchasedAt) return setError('Informe manualmente a data e o horário da compra.')
    for (const item of draft.items) {
"""
new = """    if (!draft.establishmentId) return setError('Escolha o estabelecimento onde a compra foi realizada.')
    if (!draft.purchasedAt) return setError('Informe manualmente a data e o horário da compra.')
    if (!draft.paymentMethod) return setError('Informe a forma de pagamento da compra.')
    for (const item of draft.items) {
"""
assert old in source, 'request validation block not found'
source = source.replace(old, new, 1)

old = """              <div className=\"receipt-quality-grid\">
                <span className={draft.declaredItemCount ? 'ok' : 'warn'}><small>Itens na nota</small><b>{draft.declaredItemCount ?? 'Não identificado'}</b></span>
                <span className={draft.declaredItemCount === draft.items.length ? 'ok' : 'warn'}><small>Itens encontrados</small><b>{draft.items.length}</b></span>
                <span className={draft.totalCents ? 'ok' : 'warn'}><small>Total da nota</small><b>{draft.totalCents ? formatBRL(draft.totalCents) : 'Não identificado'}</b></span>
                <span className={!draft.totalCents || Math.abs(differenceCents) <= Math.max(5, Math.round(draft.totalCents * .03)) ? 'ok' : 'warn'}><small>Valor encontrado</small><b>{formatBRL(calculatedTotalCents)}</b></span>
              </div>
"""
new = """              <div className=\"receipt-quality-grid receipt-quality-grid-pairs\">
                <span className={draft.declaredItemCount === draft.items.length ? 'ok' : 'warn'}>
                  <small>Itens encontrados</small>
                  <b>{draft.declaredItemCount ? `${draft.items.length}/${draft.declaredItemCount} itens encontrados` : `${draft.items.length} ${draft.items.length === 1 ? 'item encontrado' : 'itens encontrados'}`}</b>
                  <em>{draft.declaredItemCount ? `A nota informa ${draft.declaredItemCount} itens no total.` : 'A quantidade total da nota não pôde ser lida com segurança.'}</em>
                </span>
                <span className={!draft.totalCents || Math.abs(differenceCents) <= Math.max(5, Math.round(draft.totalCents * .03)) ? 'ok' : 'warn'}>
                  <small>Valor encontrado</small>
                  <b>{draft.totalCents ? `${formatBRL(calculatedTotalCents)} de ${formatBRL(draft.totalCents)}` : formatBRL(calculatedTotalCents)}</b>
                  <em>{draft.totalCents ? `Total informado na nota: ${formatBRL(draft.totalCents)}.` : 'O total impresso na nota não pôde ser identificado.'}</em>
                </span>
              </div>
"""
assert old in source, 'quality grid not found'
source = source.replace(old, new, 1)

old = """              <div className=\"receipt-location-choice-actions\">
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === true ? 'active' : ''}`} type=\"button\" onClick={() => updateDraft({ isNewEstablishment: true, establishmentId: '' })}><strong>Sim, é um local novo</strong><span>Cadastre primeiro na aba Cadastrando.</span></button>
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === false ? 'active' : ''}`} type=\"button\" onClick={() => updateDraft({ isNewEstablishment: false })}><strong>Não, já está cadastrado</strong><span>Escolha um dos seus estabelecimentos.</span></button>
              </div>
"""
new = """              <div className=\"receipt-location-choice-actions\">
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === false ? 'active' : ''}`} type=\"button\" onClick={() => updateDraft({ isNewEstablishment: false })}><strong>Não, já está cadastrado</strong><span>Escolha um dos seus estabelecimentos.</span></button>
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === true ? 'active' : ''}`} type=\"button\" onClick={() => updateDraft({ isNewEstablishment: true, establishmentId: '' })}><strong>Sim, é um local novo</strong><span>Cadastre primeiro na aba Cadastrando.</span></button>
              </div>
"""
assert old in source, 'location buttons not found'
source = source.replace(old, new, 1)

old = """            <section className=\"receipt-review-card receipt-purchase-data\"><div className=\"receipt-card-title\"><div><span className=\"page-kicker\">DADOS DA COMPRA</span><h3>{sourceLabel(draft.sourceKind)}</h3></div></div><div className=\"receipt-review-main-grid\"><label className=\"field\"><span>Data e horário *</span><input type=\"datetime-local\" required value={localDateTimeInput(draft.purchasedAt)} onChange={(e)=>updateDraft({purchasedAt:e.target.value ? dateInputToIso(e.target.value) : ''})}/><small className=\"receipt-required-note\">Preencha manualmente para confirmar a data correta da compra.</small></label><label className=\"field\"><span>Pagamento</span><select value={draft.paymentMethod} onChange={(e)=>updateDraft({paymentMethod:e.target.value})}><option value=\"\">Não identificado</option><option value=\"debit_card\">Cartão de débito</option><option value=\"credit_card\">Cartão de crédito</option><option value=\"pix\">Pix</option><option value=\"cash\">Dinheiro</option><option value=\"benefit\">VA / VR</option><option value=\"other\">Outro</option></select></label></div></section>

            <section className=\"receipt-review-card\"><div className=\"receipt-stage-heading\">"""
new = """            {establishmentReady ? <section className=\"receipt-review-card receipt-purchase-data receipt-flow-unlocked\"><div className=\"receipt-card-title\"><div><span className=\"page-kicker\">DADOS DA COMPRA</span><h3>{sourceLabel(draft.sourceKind)}</h3><p>Preencha os dois campos obrigatórios para liberar a revisão dos itens.</p></div><span className=\"receipt-flow-badge\">ETAPA 2</span></div><div className=\"receipt-review-main-grid receipt-purchase-data-grid\"><label className=\"field\"><span>Data e horário *</span><input type=\"datetime-local\" required value={localDateTimeInput(draft.purchasedAt)} onChange={(e)=>updateDraft({purchasedAt:e.target.value ? dateInputToIso(e.target.value) : ''})}/><small className=\"receipt-required-note\">Confirme manualmente a data correta da compra.</small></label><label className=\"field\"><span>Pagamento *</span><select required value={draft.paymentMethod} onChange={(e)=>updateDraft({paymentMethod:e.target.value})}><option value=\"\">Selecione a forma de pagamento</option><option value=\"debit_card\">Cartão de débito</option><option value=\"credit_card\">Cartão de crédito</option><option value=\"pix\">Pix</option><option value=\"cash\">Dinheiro</option><option value=\"benefit\">VA / VR</option><option value=\"other\">Outro</option></select><small className=\"receipt-required-note\">Informe como esta compra foi paga.</small></label></div></section> : <section className=\"receipt-flow-lock\"><span className=\"receipt-flow-lock-icon\">2</span><div><span className=\"page-kicker\">PRÓXIMA ETAPA</span><h3>Dados da compra bloqueados</h3><p>Primeiro confirme acima se o estabelecimento já está cadastrado e selecione o local correto.</p></div></section>}

            {purchaseDataReady ? <>
            <section className=\"receipt-review-card\"><div className=\"receipt-stage-heading\">"""
assert old in source, 'purchase data/items boundary not found'
source = source.replace(old, new, 1)

old = """            <div className=\"receipt-review-footer\"><div><strong>{newProductsCount} {newProductsCount===1?'produto novo':'produtos novos'}</strong><span>{files.length} {files.length===1?'arquivo processado':'arquivos processados'} · {qualityText.label}</span></div><button className=\"button button-primary\" type=\"button\" onClick={requestRegistration} disabled={!draft.items.length || Boolean(duplicatePurchaseId) || isPending || draft.isNewEstablishment !== false || !draft.establishmentId || !draft.purchasedAt}>Registrar compra</button></div>
          </div> : null}
"""
new = """            <div className=\"receipt-review-footer\"><div><strong>{newProductsCount} {newProductsCount===1?'produto novo':'produtos novos'}</strong><span>{files.length} {files.length===1?'arquivo processado':'arquivos processados'} · {qualityText.label}</span></div><button className=\"button button-primary\" type=\"button\" onClick={requestRegistration} disabled={!draft.items.length || Boolean(duplicatePurchaseId) || isPending || !purchaseDataReady}>Registrar compra</button></div>
            </> : <section className=\"receipt-flow-lock receipt-flow-lock-final\"><span className=\"receipt-flow-lock-icon\">3</span><div><span className=\"page-kicker\">ITENS E CONFERÊNCIA</span><h3>Complete os dados da compra para continuar</h3><p>Depois de preencher Data e horário e Pagamento, os produtos identificados, os valores e o botão de registro serão liberados.</p></div></section>}
          </div> : null}
"""
assert old in source, 'review footer boundary not found'
source = source.replace(old, new, 1)

component_path.write_text(source, encoding='utf-8')

css_path = Path('src/app/receipt-quality.css')
css = css_path.read_text(encoding='utf-8')
addition = r'''

/* Progressive receipt review */
.receipt-quality-grid.receipt-quality-grid-pairs { grid-template-columns:repeat(2,minmax(0,1fr)); }
.receipt-quality-grid.receipt-quality-grid-pairs span { gap:5px; min-height:76px; justify-content:center; }
.receipt-quality-grid.receipt-quality-grid-pairs b { font-size:14px; }
.receipt-quality-grid.receipt-quality-grid-pairs em { color:#858585; font-size:10px; font-style:normal; line-height:1.35; }
.receipt-flow-unlocked { border-color:rgba(240,207,135,.18); animation:receiptFlowUnlock .22s ease both; }
@keyframes receiptFlowUnlock { from { opacity:.55; transform:translateY(5px); } to { opacity:1; transform:none; } }
.receipt-flow-badge { align-self:flex-start; color:#d9b65f; border:1px solid rgba(240,207,135,.22); background:rgba(240,207,135,.05); border-radius:999px; padding:6px 9px; font-size:9px; font-weight:800; letter-spacing:.06em; }
.receipt-purchase-data .receipt-card-title { align-items:flex-start; }
.receipt-purchase-data .receipt-card-title h3 { margin-bottom:4px; }
.receipt-purchase-data .receipt-card-title p { margin:0; color:#858585; font-size:11px; }
.receipt-purchase-data-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; align-items:start !important; gap:18px !important; }
.receipt-purchase-data-grid .field { min-width:0; align-self:start; }
.receipt-purchase-data-grid .field > span { display:block; min-height:15px; }
.receipt-purchase-data-grid .field input,
.receipt-purchase-data-grid .field select { width:100%; min-height:52px; box-sizing:border-box; }
.receipt-purchase-data-grid .receipt-required-note { display:block; min-height:15px; line-height:1.35; }
.receipt-flow-lock { border:1px dashed rgba(255,255,255,.11); border-radius:17px; background:linear-gradient(135deg,rgba(255,255,255,.018),rgba(255,255,255,.007)); padding:18px 20px; display:flex; align-items:center; gap:15px; color:#777; }
.receipt-flow-lock-icon { width:38px; height:38px; flex:0 0 auto; display:grid; place-items:center; border-radius:12px; border:1px solid rgba(255,255,255,.1); background:#101011; color:#9d8b65; font-weight:800; }
.receipt-flow-lock h3 { margin:3px 0 4px; color:#b7b4ae; font-size:16px; }
.receipt-flow-lock p { margin:0; color:#777; font-size:11px; line-height:1.5; }
.receipt-flow-lock-final { min-height:92px; }

@media (max-width:760px) {
  .receipt-quality-grid.receipt-quality-grid-pairs { grid-template-columns:1fr; }
  .receipt-quality-grid.receipt-quality-grid-pairs span { border-right:0; border-bottom:1px solid rgba(255,255,255,.07); }
  .receipt-quality-grid.receipt-quality-grid-pairs span:last-child { border-bottom:0; }
  .receipt-purchase-data-grid { grid-template-columns:1fr !important; }
  .receipt-flow-lock { align-items:flex-start; }
}
'''
if '/* Progressive receipt review */' not in css:
    css += addition
css_path.write_text(css, encoding='utf-8')

backend_path = Path('src/app/app/comprando/import-actions.ts')
backend = backend_path.read_text(encoding='utf-8')
old = """  if (!payload.purchased_at || Number.isNaN(new Date(payload.purchased_at).getTime())) {
    return { ok: false, message: 'Informe e confirme manualmente a data e o horário da compra.' }
  }

  const safePayload: ImportedPurchasePayloadType = {
"""
new = """  if (!payload.purchased_at || Number.isNaN(new Date(payload.purchased_at).getTime())) {
    return { ok: false, message: 'Informe e confirme manualmente a data e o horário da compra.' }
  }

  if (!payload.payment_method?.trim()) {
    return { ok: false, message: 'Informe a forma de pagamento da compra.' }
  }

  const safePayload: ImportedPurchasePayloadType = {
"""
assert old in backend, 'backend date validation block not found'
backend = backend.replace(old, new, 1)
backend_path.write_text(backend, encoding='utf-8')
