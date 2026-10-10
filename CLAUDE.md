# CLAUDE.md

App pessoal de divisão de gastos de um casal (PWA). UI e domínio em português do Brasil.

- Stack: Vite + React 19 + TS + Supabase. Sem backend próprio: regras de acesso no RLS, escrita
  atômica de despesa via RPC `save_expense`. Schema em `supabase/migrations/`.
- Migration nova não é aplicada sozinha: cole o SQL na conversa para o dono rodar no SQL Editor.
- Lógica pura em `src/lib/*.ts` com testes Vitest (`npm test`, fuso fixo America/Sao_Paulo).
  Mexeu em divisão/saldo/valor/data → atualize o teste junto.
- A proporção de divisão é do projeto (`project_members.weight`), sem divisão por despesa. Cada
  despesa grava a foto da divisão em `expense_splits`, para mudança de proporção não reescrever o
  histórico.
- Dinheiro sempre em centavos inteiros (`bigint` no banco). Nunca some floats de reais.
- "Hoje" sempre por `todayISO()` (fuso de Brasília), nunca `toISOString()`.
- Rotas por hash (`#/p/:id`) para funcionar em hospedagem estática sem rewrite.
- Consultas que podem passar de 1000 linhas usam `fetchAll` (teto do PostgREST).
