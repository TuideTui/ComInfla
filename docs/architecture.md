# Arquitetura inicial do ComInfla

## Visão geral

```text
Web (Next.js)
   │
   ├── Supabase Auth
   ├── Supabase PostgreSQL + RLS
   └── Supabase Storage / Edge Functions (futuro)

Deploy web: Vercel
Código: GitHub
App iOS futuro: React Native + Expo, usando o mesmo Supabase
```

## Princípios de segurança

- Senhas são gerenciadas pelo Supabase Auth; não ficam em tabelas da aplicação.
- Tabelas privadas usam Row Level Security (RLS).
- O frontend utiliza somente a publishable key do Supabase.
- Credenciais administrativas/service-role nunca devem ser colocadas no navegador ou aplicativo.
- A identidade do usuário é validada no servidor usando claims autenticadas.
- Rotas locais de retorno são validadas para evitar open redirects.
- Valores monetários são armazenados em centavos inteiros.

## Fluxo de autenticação

```text
Criar conta
  → Supabase Auth
  → confirmação por email
  → /auth/callback ou /auth/confirm
  → sessão SSR em cookies
  → /app
```

Também existem fluxos de recuperação de senha, atualização de senha e logout.

## Banco atual

Tabelas principais:

- profiles
- categories
- products
- establishments
- purchases
- purchase_items
- insight_events
- baskets
- basket_items
- monthly_closings

O banco já possui RLS e um motor inicial de insights de preço.

## Próximas entregas

1. Publicar a aplicação na Vercel.
2. Configurar URLs de redirecionamento do Supabase para produção.
3. Testar cadastro, confirmação de email, login e logout ponta a ponta.
4. Implementar `Comprando`: estabelecimento → produto → compra → item da compra.
5. Exibir o insight gerado após o cadastro da compra.
6. Construir histórico e primeiras análises.
