from pathlib import Path

path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

old = """type ReviewDraft = Omit<ParsedReceipt, 'items'> & {
  fingerprint: string
  establishmentId: string
  newEstablishmentName: string
  newEstablishmentType: string
  items: ReviewItem[]
}"""
new = """type ReviewDraft = Omit<ParsedReceipt, 'items'> & {
  fingerprint: string
  establishmentId: string
  isNewEstablishment: boolean | null
  declaredItemCount: number | null
  items: ReviewItem[]
}"""
assert old in source
source = source.replace(old, new, 1)

marker = """function dateInputToIso(value: string) {
  if (!value) return new Date().toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}
"""
addition = marker + """
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
assert marker in source
source = source.replace(marker, addition, 1)

old = """  const establishmentOptions = useMemo<SearchableOption[]>(() => [
    { value: NEW_VALUE, label: '+ Criar estabelecimento a partir da nota', meta: 'Será criado somente ao confirmar a compra', searchText: 'novo criar estabelecimento' },
    ...establishments.map((item) => ({ value: item.id, label: item.name, meta: [item.neighborhood, item.city].filter(Boolean).join(' · ') || undefined, searchText: `${item.name} ${item.neighborhood ?? ''} ${item.city ?? ''}` })),
  ], [establishments])"""
new = """  const establishmentOptions = useMemo<SearchableOption[]>(() => establishments.map((item) => ({
    value: item.id,
    label: item.name,
    meta: [item.neighborhood, item.city].filter(Boolean).join(' · ') || undefined,
    searchText: `${item.name} ${item.neighborhood ?? ''} ${item.city ?? ''}`,
  })), [establishments])"""
assert old in source
source = source.replace(old, new, 1)

old = """  const quality = useMemo<ImportQuality>(() => {
    if (!draft || draft.items.length === 0) return 'weak'
    const tolerance = draft.totalCents ? Math.max(5, Math.round(draft.totalCents * .03)) : 0
    const totalMatches = !draft.totalCents || Math.abs(differenceCents) <= tolerance
    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length
    if (draft.items.length >= 2 && totalMatches && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'
    return 'partial'
  }, [draft, differenceCents])"""
new = """  const quality = useMemo<ImportQuality>(() => {
    if (!draft || draft.items.length === 0) return 'weak'
    const tolerance = draft.totalCents ? Math.max(5, Math.round(draft.totalCents * .03)) : 0
    const totalMatches = !draft.totalCents || Math.abs(differenceCents) <= tolerance
    const countMatches = !draft.declaredItemCount || draft.declaredItemCount === draft.items.length
    const lowConfidence = draft.items.filter((item) => item.confidence === 'low').length
    if (totalMatches && countMatches && lowConfidence <= Math.ceil(draft.items.length * .25)) return 'good'
    return 'partial'
  }, [draft, differenceCents])"""
assert old in source
source = source.replace(old, new, 1)

old = """      const matchedEstablishment = bestEstablishment(parsed, establishments)
      const review: ReviewDraft = {
        ...parsed,
        fingerprint,
        establishmentId: matchedEstablishment || NEW_VALUE,
        newEstablishmentName: parsed.merchantName || '',
        newEstablishmentType: parsed.sourceKind === 'delivery' ? 'restaurant' : 'market',
        items: parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) })),
      }"""
new = """      const review: ReviewDraft = {
        ...parsed,
        purchasedAt: '',
        fingerprint,
        establishmentId: '',
        isNewEstablishment: null,
        declaredItemCount: detectDeclaredItemCount(texts.join('\\n')),
        items: parsed.items.map((item) => ({ ...item, productId: bestProduct(item, products) })),
      }"""
assert old in source
source = source.replace(old, new, 1)

old = """  function requestRegistration() {
    if (!draft) return
    if (!draft.items.length) return setError('Adicione pelo menos um item antes de registrar.')
    if (draft.establishmentId === NEW_VALUE && !draft.newEstablishmentName.trim()) return setError('Informe o nome do estabelecimento.')
    for (const item of draft.items) {
      if (item.productId === NEW_VALUE && !item.name.trim()) return setError('Preencha o nome de todos os produtos novos.')
      if (item.quantity <= 0) return setError('Revise as quantidades dos itens.')
    }
    if (duplicatePurchaseId) return setError('Este comprovante já parece ter sido registrado anteriormente.')
    setError(''); setConfirmOpen(true)
  }"""
new = """  function requestRegistration() {
    if (!draft) return
    if (!draft.items.length) return setError('Adicione pelo menos um item antes de registrar.')
    if (draft.isNewEstablishment === null) return setError('Confirme se o local é novo ou já está cadastrado.')
    if (draft.isNewEstablishment) return setError('Cadastre o novo estabelecimento antes de continuar com esta importação.')
    if (!draft.establishmentId) return setError('Escolha o estabelecimento onde a compra foi realizada.')
    if (!draft.purchasedAt) return setError('Informe manualmente a data e o horário da compra.')
    for (const item of draft.items) {
      if (item.productId === NEW_VALUE && !item.name.trim()) return setError('Preencha o nome de todos os produtos novos.')
      if (item.quantity <= 0) return setError('Revise as quantidades dos itens.')
    }
    if (duplicatePurchaseId) return setError('Este comprovante já parece ter sido registrado anteriormente.')
    setError(''); setConfirmOpen(true)
  }"""
assert old in source
source = source.replace(old, new, 1)

old = """      establishment_id: draft.establishmentId === NEW_VALUE ? null : draft.establishmentId,
      new_establishment: draft.establishmentId === NEW_VALUE ? { name: draft.newEstablishmentName.trim(), type: draft.newEstablishmentType } : undefined,
      purchased_at: dateInputToIso(localDateTimeInput(draft.purchasedAt) || localDateTimeInput(new Date().toISOString())),"""
new = """      establishment_id: draft.establishmentId,
      purchased_at: draft.purchasedAt,"""
assert old in source
source = source.replace(old, new, 1)
source = source.replace('barcode: item.barcode, quantity:', 'barcode: null, quantity:', 1)

quality_start = source.index('            <section className={`receipt-quality-card ${quality}`}>')
quality_end = source.index('\n            {draft.warnings.length ?', quality_start)
new_quality = """            <section className={`receipt-quality-card ${quality}`}>
              <div className="receipt-quality-head"><span className="receipt-quality-dot"/><div><span className="page-kicker">RESUMO DA LEITURA</span><h3>{quality === 'good' ? 'A leitura está consistente' : quality === 'partial' ? 'Encontramos dados, mas há diferenças para revisar' : 'A leitura precisa de revisão'}</h3><p>Compare o que a nota informa com o que o ComInfla conseguiu montar.</p></div><strong>{qualityText.label}</strong></div>
              <div className="receipt-quality-grid">
                <span className={draft.declaredItemCount ? 'ok' : 'warn'}><small>Itens na nota</small><b>{draft.declaredItemCount ?? 'Não identificado'}</b></span>
                <span className={draft.declaredItemCount === draft.items.length ? 'ok' : 'warn'}><small>Itens encontrados</small><b>{draft.items.length}</b></span>
                <span className={draft.totalCents ? 'ok' : 'warn'}><small>Total da nota</small><b>{draft.totalCents ? formatBRL(draft.totalCents) : 'Não identificado'}</b></span>
                <span className={!draft.totalCents || Math.abs(differenceCents) <= Math.max(5, Math.round(draft.totalCents * .03)) ? 'ok' : 'warn'}><small>Valor encontrado</small><b>{formatBRL(calculatedTotalCents)}</b></span>
              </div>
            </section>

            <section className="receipt-location-choice">
              <div className="receipt-location-choice-head"><span className="page-kicker">ESTABELECIMENTO</span><h3>Este é um local novo?</h3><p>O ComInfla não cria estabelecimentos automaticamente a partir da nota. Confirme como deseja continuar.</p></div>
              <div className="receipt-location-choice-actions">
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === true ? 'active' : ''}`} type="button" onClick={() => updateDraft({ isNewEstablishment: true, establishmentId: '' })}><strong>Sim, é um local novo</strong><span>Cadastre primeiro na aba Cadastrando.</span></button>
                <button className={`receipt-location-choice-button ${draft.isNewEstablishment === false ? 'active' : ''}`} type="button" onClick={() => updateDraft({ isNewEstablishment: false })}><strong>Não, já está cadastrado</strong><span>Escolha um dos seus estabelecimentos.</span></button>
              </div>
              {draft.isNewEstablishment === true ? <div className="receipt-location-new"><p>Vamos abrir o cadastro de estabelecimento já no formulário correto. Depois, volte para Comprando e faça a importação novamente.</p><button className="button button-primary" type="button" onClick={() => window.location.assign('/app/cadastrando?open=establishment')}>Cadastrar estabelecimento →</button></div> : null}
              {draft.isNewEstablishment === false ? <div className="field receipt-location-existing"><span>Estabelecimento *</span><SearchableSelect value={draft.establishmentId} onChange={(value) => updateDraft({ establishmentId: value })} options={establishmentOptions} placeholder="Escolha um estabelecimento" searchPlaceholder="Buscar estabelecimento…" emptyMessage="Nenhum estabelecimento cadastrado." ariaLabel="Estabelecimento"/></div> : null}
            </section>
"""
source = source[:quality_start] + new_quality + source[quality_end:]

data_start = source.index('            <section className="receipt-review-card receipt-purchase-data">')
data_end = source.index('\n\n            <section className="receipt-review-card"><div className="receipt-stage-heading">', data_start)
new_data = """            <section className="receipt-review-card receipt-purchase-data"><div className="receipt-card-title"><div><span className="page-kicker">DADOS DA COMPRA</span><h3>{sourceLabel(draft.sourceKind)}</h3></div></div><div className="receipt-review-main-grid"><label className="field"><span>Data e horário *</span><input type="datetime-local" required value={localDateTimeInput(draft.purchasedAt)} onChange={(e)=>updateDraft({purchasedAt:e.target.value ? dateInputToIso(e.target.value) : ''})}/><small className="receipt-required-note">Preencha manualmente para confirmar a data correta da compra.</small></label><label className="field"><span>Pagamento</span><select value={draft.paymentMethod} onChange={(e)=>updateDraft({paymentMethod:e.target.value})}><option value="">Não identificado</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="benefit">VA / VR</option><option value="other">Outro</option></select></label></div></section>"""
source = source[:data_start] + new_data + source[data_end:]

barcode_field = """{item.barcode ? <label className="field"><span>Código de barras</span><input value={item.barcode} onChange={(e)=>updateItem(item.key,{barcode:e.target.value.replace(/\\D/g,'')||null})}/></label>:null}"""
source = source.replace(barcode_field, '', 1)

source = source.replace("draft.establishmentId===NEW_VALUE?draft.newEstablishmentName:establishments.find((item)=>item.id===draft.establishmentId)?.name", "establishments.find((item)=>item.id===draft.establishmentId)?.name || 'Não selecionado'", 1)

old_button = """<button className="button button-primary" type="button" onClick={requestRegistration} disabled={!draft.items.length || Boolean(duplicatePurchaseId) || isPending}>Registrar compra</button>"""
new_button = """<button className="button button-primary" type="button" onClick={requestRegistration} disabled={!draft.items.length || Boolean(duplicatePurchaseId) || isPending || draft.isNewEstablishment !== false || !draft.establishmentId || !draft.purchasedAt}>Registrar compra</button>"""
assert old_button in source
source = source.replace(old_button, new_button, 1)

assert 'newEstablishmentName' not in source
assert 'newEstablishmentType' not in source
assert '+ Criar estabelecimento a partir da nota' not in source
assert 'Código de barras</span><input value={item.barcode}' not in source

path.write_text(source, encoding='utf-8')
