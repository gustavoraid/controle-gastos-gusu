# CLAUDE.md

App pessoal de divisão de gastos de um casal (PWA). UI e domínio em português do Brasil.
Exatamente duas contas, criadas no painel do Supabase (o app só tem login; o banco recusa a terceira
e não deixa criar projeto antes das duas existirem). Todo projeto inclui as duas — não há convite.

- Stack: Vite + React 19 + TS + Supabase. Sem backend próprio: regras de acesso no RLS. Schema em
  `supabase/migrations/`.
- Migration nova não é aplicada sozinha: cole o SQL na conversa para o dono rodar no SQL Editor.
- Lógica pura em `src/lib/*.ts` com testes Vitest (`npm test`, fuso fixo America/Sao_Paulo).
  Mexeu em divisão/saldo/valor/data → atualize o teste junto.
- A proporção de divisão é do projeto (`project_members.weight`) e é recalculada retroativamente
  (decisão do dono): nada de divisão gravada por despesa. A view `expense_shares` (SQL) e
  `expenseShares()` (TS) têm que dar o mesmo centavo — maior resto, empate pelo menor user_id.
- Dinheiro sempre em centavos inteiros (`bigint` no banco). Nunca some floats de reais.
- "Hoje" sempre por `todayISO()` (fuso de Brasília), nunca `toISOString()`.
- Rotas por hash (`#/p/:id`) para funcionar em hospedagem estática sem rewrite.
- Consultas que podem passar de 1000 linhas usam `fetchAll` (teto do PostgREST).
