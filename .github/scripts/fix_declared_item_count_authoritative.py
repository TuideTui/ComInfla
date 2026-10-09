from pathlib import Path

path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

old = '''function resolveDeclaredItemCount(texts: string[], parsedItemCount: number) {
  const joined = texts.join('\\n')
  const declared = detectDeclaredItemCount(joined)
  const visualCount = Math.max(0, ...texts.map(detectLikelyProductRowCount))
  const observedFloor = Math.max(parsedItemCount, visualCount)

  // A quantidade explicitamente impressa na NFC-e (ex.: QTD. TOTAL DE ITENS 009)
  // é a fonte principal quando o OCR produz um valor plausível. A leitura visual
  // serve apenas como fallback, porque sombras e caracteres quebrados podem fazer
  // o OCR enxergar somente parte das linhas de produto.
  if (declared && declared >= 1 && declared <= 60) {
    // Nunca aceitamos um denominador menor do que aquilo que já conseguimos
    // estruturar/observar na própria tabela.
    return Math.max(declared, observedFloor)
  }

  if (visualCount >= 3 && visualCount <= 60) return Math.max(visualCount, parsedItemCount)
  return parsedItemCount > 0 ? parsedItemCount : null
}'''

new = '''function resolveDeclaredItemCount(texts: string[], parsedItemCount: number) {
  const joined = texts.join('\\n')
  const declared = detectDeclaredItemCount(joined)
  const visualCount = Math.max(0, ...texts.map(detectLikelyProductRowCount))

  // Quando a própria NFC-e informa explicitamente "QTD. TOTAL DE ITENS",
  // esse valor é autoritativo para o denominador da revisão. As heurísticas
  // visuais não podem aumentar esse número (ex.: 009 nunca vira 10).
  if (declared && declared >= 1 && declared <= 60) return declared

  // Só usamos a contagem visual como fallback quando o campo explícito não foi lido.
  if (visualCount >= 3 && visualCount <= 60) return Math.max(visualCount, parsedItemCount)
  return parsedItemCount > 0 ? parsedItemCount : null
}'''

if old not in source:
    raise SystemExit('resolveDeclaredItemCount block not found')

path.write_text(source.replace(old, new, 1), encoding='utf-8')
