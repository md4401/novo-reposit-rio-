# ninho.

- Produto e textos em português do Brasil. Código em inglês, comentários em português.
- Dinheiro sempre em centavos inteiros (`bigint` no banco, `number` inteiro no TS). Nunca float em totais.
- Schema: `db/migrations/*.sql` é a fonte da verdade. Mudança nova = nova migration numerada (nunca editar uma já aplicada). Categorias vêm de `shared/categories.ts` (copiadas no `npm run db:migrate`).
- Privacidade: toda consulta pessoal filtra por `profile_id` da sessão; a visão da família só lê `transaction_allocations.scope = 'family'` e nunca devolve linhas individuais, lojas ou nomes.
- A soma das divisões tem de fechar o valor da transação (trigger adiado `check_allocations`). Transações importadas (csv/ofx) não são apagadas: ficam `ignored`.
- A IA nunca grava sozinha: lançamentos por texto/voz/nota viram proposta que a pessoa confirma.
- Todas as rotas da API ficam em `server/routes.ts` (uma única função da Vercel em `api/router.ts`).
- Checks: `npm run typecheck && npm test && npm run build`.
