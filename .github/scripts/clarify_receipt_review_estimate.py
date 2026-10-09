from pathlib import Path

path = Path('src/components/receipt-importer-v2.tsx')
source = path.read_text(encoding='utf-8')
old = "<em>{incompleteItemCount > 0 ? `${incompleteItemCount} ${incompleteItemCount === 1 ? 'item precisa' : 'itens precisam'} de revisão antes do registro.` : 'Revise nomes, quantidades e preços antes de registrar.'}</em>"
new = "<em>{incompleteItemCount > 0 ? `Aproximadamente ${incompleteItemCount} ${incompleteItemCount === 1 ? 'item precisa' : 'itens precisam'} de revisão antes do registro. Essa é uma estimativa da plataforma; confira seus itens.` : 'Revise nomes, quantidades e preços antes de registrar.'}</em>"
if old not in source:
    raise SystemExit('target text not found')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
