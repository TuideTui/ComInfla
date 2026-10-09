from pathlib import Path
import re
import subprocess

# Volta apenas o parser de itens para a versão que já estava recuperando melhor
# os produtos e valores desta NFC-e.
parser_content = subprocess.check_output([
    'git', 'show',
    '365cc051cc9ad07c52a5176e738b1235d1e36c0a:src/lib/receipt-parser-smart.ts'
], text=True)
Path('src/lib/receipt-parser-smart.ts').write_text(parser_content, encoding='utf-8')

# Mantém a UI/fluxo atual, mas torna a contagem da quantidade de itens independente
# da heurística usada para reconstruir produtos.
path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')

replacement = r'''function detectLikelyProductRowCount(text: string) {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  const lines = normalized.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  let insideItems = false
  let count = 0

  for (const original of lines) {
    const line = original.replace(/[OQ]/g, '0').replace(/[IL]/g, '1')
    if (/DESCRI/.test(line) && /(QTD|VL|TOTAL|CODIGO)/.test(line)) {
      insideItems = true
      continue
    }
    if (!insideItems) continue
    if (/(QTD\W*TOTAL|VALOR\W*TOTAL|CARTAO|CONSULTE\W+PELA)/.test(line)) break

    // Em NFC-e, cada linha real de produto traz um código longo logo no começo.
    // Contamos a linha, não o índice 01/02/03, porque o OCR costuma deformar esses índices.
    const head = line.slice(0, 52)
    const barcodeLike = head.match(/(?:\d[\s.\-]*){8,16}/)
    if (barcodeLike) count++
  }

  return count
}

function resolveDeclaredItemCount(texts: string[], parsedItemCount: number) {
  const joined = texts.join('\n')
  const declared = detectDeclaredItemCount(joined)
  const visualCount = Math.max(0, ...texts.map(detectLikelyProductRowCount))

  // A contagem visual por linhas de código de produto é a fonte mais confiável
  // quando há uma tabela NFC-e legível. Ela não depende do OCR acertar "009".
  if (visualCount >= 3 && visualCount <= 60) return visualCount
  if (declared && declared >= 1 && declared <= 60) return declared
  return parsedItemCount > 0 ? parsedItemCount : null
}

function productLabel'''

pattern = re.compile(r"function detectLikelyProductRowCount\(text: string\) \{.*?\nfunction productLabel", re.S)
if not pattern.search(source):
    raise SystemExit('Bloco detectLikelyProductRowCount/resolveDeclaredItemCount não encontrado')
source = pattern.sub(replacement, source, count=1)

path.write_text(source, encoding='utf-8')
