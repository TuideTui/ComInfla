# ComInfla — Status de implementação

Este documento acompanha a implementação do `ComInfla_Requisitos.md` e deve ser atualizado junto com o desenvolvimento.

Legenda:
- ✅ Implementado e conectado ao banco real
- 🟡 Parcial / primeira versão funcional
- ⏳ Planejado
- 🔭 Fase futura prevista no documento de requisitos

## MVP principal

| Requisito | Status | Implementação atual |
|---|---:|---|
| Principal / resumo autenticado | ✅ | Dashboard real com gasto mensal, produtos, locais, última compra, local mais usado e insights |
| RF-001 Cadastrar produto | ✅ | Nome, marca, categoria, subcategoria, apresentação, embalagem, código de barras, foto e observação; quantidade comprada não fica no cadastro do produto |
| RF-002 Diferenciar variações | ✅ | Campo de apresentação diferencia versões como 350 ml, 600 ml ou 2 L sem confundir com quantidade comprada |
| RF-003 Possíveis duplicados | 🟡 | Bloqueio inicial para nome + marca + apresentação equivalentes; similaridade avançada virá depois |
| RF-005 Cadastrar estabelecimento | ✅ | Tipo, frequência, endereço, bairro, cidade, UF, foto, coordenadas opcionais e observação |
| RF-006 Tipo de estabelecimento | ✅ | Tipos definidos no cadastro |
| RF-007 Localização no mapa | ✅ | Coordenadas podem ser obtidas com permissão do navegador e o local passa a aparecer no mapa |
| RF-008 Registrar compra | ✅ | Produto, local, data/hora, quantidade comprada, preço, desconto, promoção, pagamento e observação |
| RF-009 Compra com múltiplos produtos | ✅ | Formulário dinâmico com vários itens |
| RF-010 Registro rápido | ✅ | Produtos e estabelecimentos existentes podem ser reutilizados |
| RF-011 Acima da média | ✅ | Trigger no PostgreSQL + popup/histórico |
| RF-012 Novo menor preço | ✅ | Trigger no PostgreSQL + metadata do menor anterior |
| RF-013 Novo maior preço | ✅ | Trigger no PostgreSQL + metadata do maior anterior |
| RF-014 Sequência de aumentos | ⏳ | Motor mensal ainda será implementado |
| RF-015 Muito acima do padrão | 🟡 | Há alerta acima da média; regra específica de outlier será refinada |
| RF-016 Muito abaixo do padrão | ✅ | Insight abaixo da média histórica |
| RF-017 Mesmo estabelecimento | ✅ | Compara com a compra anterior do produto no mesmo local |
| RF-018 Comparação anual | ⏳ | Planejado após aumento do histórico |
| RF-019 Visualizar histórico | ✅ | Histórico por compra e item com preço, média e indicadores |
| RF-020 Filtrar histórico | ⏳ | Próxima etapa do MVP |
| RF-021 Editar compra | ✅ | Edição recria itens e recalcula insights |
| RF-022 Excluir compra | ✅ | Remove compra, itens e insights relacionados |

## Análises

| Requisito | Status | Implementação atual |
|---|---:|---|
| RF-023 Histórico de preço por produto | 🟡 | Estatísticas e variação já existem; gráfico temporal detalhado será refinado |
| RF-024 Estatísticas do produto | 🟡 | Último, média, menor, maior, quantidade e variação primeiro→último implementados |
| RF-025 Comparação por estabelecimento | ✅ | Preço médio por local |
| RF-026 Melhor estabelecimento por produto | ✅ | Local de menor média aparece quando existe comparação possível |
| RF-027–029 Cesta pessoal | ⏳ | Estrutura de banco já existe; UI e cálculos entram na segunda fase |
| RF-030–032 Inflação pessoal | ⏳ | Banco preparado; metodologia será implementada com histórico mínimo |
| RF-033 Inflação oficial | 🔭 | Terceira fase |
| RF-034 Gastos por categoria | ✅ | Visualização por categoria |
| RF-035 Gastos por estabelecimento | 🟡 | Dados já calculáveis; mapa também resume gasto e quantidade por local |
| RF-036 Ticket médio | ✅ | Ticket médio geral no painel de análises |
| RF-037 Produto mais comprado | ✅ | Indicador de produto com maior número de registros |
| RF-038 Maior gasto acumulado por produto | ⏳ | Próxima ampliação das análises |
| RF-039–041 Outliers e maiores variações | 🟡 | Parte dos insights já existe; motor de outliers completo fica na segunda fase |
| RF-042–044 Mapa | 🟡 | Aba Mapa funcional com estabelecimentos geolocalizados, gasto, quantidade de compras e última compra; agrupamento por bairro/mapa de calor ficam para depois |

## Fechamento

| Requisito | Status | Implementação atual |
|---|---:|---|
| RF-045 Resumo mensal | ✅ | Último mês fechado: total, compras, locais, produtos, ticket e comparações |
| RF-046 Inflação pessoal mensal | ⏳ | Depende da metodologia de inflação pessoal |
| RF-047 Inflação pessoal acumulada | ⏳ | Depende da metodologia de inflação pessoal |
| RF-048 Economia potencial | ⏳ | Segunda fase; tela já reserva o indicador sem inventar valores |
| RF-049 Categoria com maior aumento | ⏳ | A implementar com agregação mensal por categoria |
| RF-050 Produto com maior aumento | ✅ | Compara média do mês fechado com o anterior |
| RF-051 Produto que mais caiu | ✅ | Compara média do mês fechado com o anterior |
| RF-052 Compra mais cara | ✅ | Implementado |
| RF-053 Produto mais caro | ✅ | Implementado |
| RF-054 Maior oportunidade perdida | ⏳ | Depende do motor de economia potencial |
| RF-055 Melhor compra do mês | ✅ | Compara preço do mês com histórico anterior |
| RF-056 Estabelecimento mais utilizado | ✅ | Implementado |
| RF-057 Estabelecimento com maior gasto | ✅ | Implementado |
| RF-058 Mudança de comportamento | ⏳ | Segunda ampliação do fechamento |
| RF-059 Sequência de aumentos | ⏳ | Depende do motor de tendência mensal |

## Recursos de suporte e fases seguintes

| Requisito | Status |
|---|---:|
| RF-060–061 Notificações | ⏳ |
| RF-062 Código de barras | 🔭 |
| RF-063 QR Code de NFC-e | 🔭 |
| RF-064 Importação XML/PDF/CSV | 🔭 |
| RF-065–066 Dados colaborativos e privacidade | 🔭 |
| RF-067 Perfil | 🟡 |
| RF-068 Categorias personalizadas | 🟡 Banco preparado, UI pendente |
| RF-069 Gerenciar estabelecimentos | ✅ Edição, foto, endereço, localização, frequência, arquivamento e exclusão de locais sem histórico |
| RF-070 Gerenciar produtos | 🟡 Edição, foto, categoria, apresentação, arquivamento e exclusão implementados; unificação de duplicados ainda pendente |
| RF-071 Busca global | ⏳ |
| RF-072 Produtos frequentes | ⏳ |
| RF-073 Estabelecimentos frequentes | 🟡 Frequência é cadastrada e influencia ordenação inicial |
| RF-074 Exportar histórico | ⏳ Segunda fase |
| RF-075 Exclusão e portabilidade | 🟡 Compras, produtos sem histórico e estabelecimentos sem histórico podem ser excluídos; conta/histórico total ainda pendentes |

## Requisitos não funcionais

- ✅ Next.js responsivo para desktop/tablet/mobile, com fluxo de compra adaptado.
- ✅ Supabase Auth e PostgreSQL com RLS nas tabelas privadas.
- ✅ Fotos em bucket privado do Supabase Storage com políticas por usuário.
- ✅ Valores monetários armazenados em centavos inteiros.
- ✅ Dados por usuário protegidos por `auth.uid()`.
- ✅ Vercel ligada à branch `main`, com deploy automático.
- 🟡 Security baseline em evolução: leaked-password protection, CAPTCHA e CSP ainda serão endurecidos antes de abertura pública.
- 🟡 Performance já conta com índices de consulta; serão revisados quando houver volume real de histórico.

## Próxima sequência recomendada

1. RF-020 — filtros de histórico.
2. RF-023/RF-024 — gráfico temporal e estatísticas completas de produto.
3. RF-035/RF-038 — análises por estabelecimento e gasto acumulado por produto.
4. RF-049 — categoria com maior aumento no fechamento.
5. RF-070 — unificação de produtos duplicados.
6. Security Baseline v1.
7. Segunda fase principal: cesta pessoal → inflação pessoal → economia potencial → mapa avançado → exportação.
