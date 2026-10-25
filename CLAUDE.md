# CLAUDE.md

App pessoal de divisão de gastos de um casal (PWA), chamado **Ratata**. UI e domínio em português do Brasil.
Exatamente duas contas, criadas no painel do Supabase (o app só tem login; o banco recusa a terceira
e não deixa criar projeto antes das duas existirem). Todo projeto inclui as duas — não há convite.

- Stack: Vite + React 19 + TS + Supabase. Sem backend próprio: regras de acesso no RLS. Schema em
  `supabase/migrations/`.
- Banco em produção (projeto Supabase `controle-gastos-gusu`) já tem `0001` e `0002` aplicados:
  mudança de schema daqui em diante é sempre uma migration NOVA, nunca edição das antigas. Com o
  conector do Supabase na sessão, aplique com `apply_migration` depois de testar localmente; sem
  ele, o dono roda no SQL Editor (cole o SQL só quando ele pedir ou ao fechar a rodada).
- Lógica pura em `src/lib/*.ts` com testes Vitest (`npm test`, fuso fixo America/Sao_Paulo).
  Mexeu em divisão/saldo/valor/data → atualize o teste junto.
- A proporção de divisão é do projeto (`project_members.weight`) e é recalculada retroativamente
  (decisão do dono): nada de divisão gravada por despesa. A view `expense_shares` (SQL) e
  `expenseShares()` (TS) têm que dar o mesmo centavo — maior resto, empate pelo menor user_id.
- Dinheiro sempre em inteiros na menor unidade da moeda (`bigint`). Despesa guarda o valor na moeda
  original (`amount` + `currency`); o valor em reais é calculado na leitura pela cotação do projeto
  (`project_currencies.rate`, retroativa). `expense_values` (SQL) e `toBrlCents()` (TS) têm que dar o
  mesmo centavo. Nunca some floats de reais.
- "Hoje" sempre por `todayISO()` (fuso do aparelho — o casal viaja; um fuso fixo erra o dia no
  exterior), nunca `toISOString()` (UTC). Os testes fixam `TZ=America/Sao_Paulo`.
- Rotas por hash (`#/p/:id`) para funcionar em hospedagem estática sem rewrite.
- Consultas que podem passar de 1000 linhas usam `fetchAll` (teto do PostgREST).
