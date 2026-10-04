# ComInfla — Web MVP

Primeira base funcional do site ComInfla.

## Stack

- Next.js (App Router)
- TypeScript
- Supabase Auth + PostgreSQL + RLS
- CSS próprio (sem template visual externo)

## Fluxo implementado nesta etapa

- Landing page
- Criar conta
- Login com email/senha
- Confirmação de sessão por callback/OTP
- Recuperação de senha
- Alteração de senha
- Sessão SSR com cookies
- Proteção de rotas com `getClaims()`
- Logout
- Callback PKCE e confirmação de email/OTP
- Dashboard conectado ao banco (perfil, gasto do mês, produtos, estabelecimentos e insights)

## Como rodar

1. Copie `.env.example` para `.env.local` e preencha os valores do Supabase.
2. Instale dependências:

```bash
npm install
```

3. Rode:

```bash
npm run dev
```

4. Acesse `http://localhost:3000`.

## Importante sobre email de confirmação

Para SSR, mantenha no Supabase as URLs de redirecionamento do ambiente local e, depois, da Vercel. O projeto também aceita o endpoint `/auth/confirm` com `token_hash` caso o template de email seja configurado nesse formato.

## Segurança

- Nenhuma secret/service-role key existe no frontend.
- `.env.local` está ignorado pelo Git.
- Dados privados estão protegidos por RLS no PostgreSQL.
- O proxy usa `supabase.auth.getClaims()` para validar a identidade no servidor.
