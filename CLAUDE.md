# CLAUDE.md

App pessoal de divisão de gastos de um casal (PWA), chamado **Ratata**. UI e domínio em português do Brasil.
Exatamente duas contas, criadas no painel do Supabase (o app só tem login; o banco recusa a terceira
e não deixa criar projeto antes das duas existirem). Todo projeto inclui as duas — não há convite.

- Stack: Vite + React 19 + TS + Supabase. Sem backend próprio: regras de acesso no RLS. Schema em
  `supabase/migrations/`.
- Banco em produção (projeto Supabase `controle-gastos-gusu`) já tem as migrations aplicadas
  (`0001` foi pelo SQL Editor, por isso não aparece em `schema_migrations`; confira o resto lá antes
  de presumir): mudança de schema é sempre uma migration NOVA, nunca edição das antigas. Com o
  conector do Supabase na sessão, aplique com `apply_migration` depois de testar localmente; sem
  ele, o dono roda no SQL Editor (cole o SQL só quando ele pedir ou ao fechar a rodada).
- Teste local de SQL: o container tem Postgres 16 (`service postgresql start`, `su postgres -c psql`).
  As migrations rodam num banco descartável com um stub de `auth` (`auth.users`, `auth.uid()`
  lendo `current_setting('app.uid')`, roles `anon`/`authenticated`/`service_role`); erros só nas
  funções que dependem do Supabase de verdade não atrapalham tabelas e views.
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

## Publicação e sessões em paralelo

- Deploy é GitHub Pages pelo workflow `Testes e publicação`, que só publica o que entra na `main`.
  PR aberto ≠ no ar: diga "falta o merge" até o merge acontecer, e confira o job `deploy` do run
  na `main` antes de afirmar que publicou. Merge só com o OK do dono; o repo usa squash com
  título terminando em `(#N)`.
- O dono costuma ter mais de uma sessão do Claude mexendo no repo ao mesmo tempo. Antes de
  começar e antes de abrir PR, `git fetch origin main` e traga a `main` para o branch; quando algo
  "sumiu" ou "não foi", a primeira suspeita é PR não mergeado, não sobrescrita.
- PWA: o GitHub Pages manda o HTML com `max-age=600`. O `public/sw.js` busca a navegação com
  `cache: "no-cache"` justamente para o app instalado não abrir a versão anterior por 10 min
  após cada deploy — não troque por `fetch(req)` simples. Mudou o SW, suba a versão de `CACHE`.
  Após um deploy, o celular precisa fechar e abrir o app (a 1ª abertura pode instalar o SW novo).
- O proxy da sessão bloqueia `*.github.io`: para ver a tela, faça build local com
  `VITE_SUPABASE_URL=http://supa.test` e rode o Chromium do container (Playwright) interceptando
  `http://supa.test/**` com dados falsos e uma sessão `sb-supa-auth-token` no localStorage.

## Dados

- Projetos em produção: "Nuestra casita" (tipo `casa`, Gustavo 2 × Suellen 1) e "Viagem Peru 2026".
- O histórico do "Nuestra casita" veio do Splitwise em 2026-10-21 (646 despesas + 22 acertos,
  saldo final Gustavo deve R$ 934,71 à Suellen). No Splitwise havia um 3º membro falso ("Gu Fake")
  para fazer o 2:1; pagamentos divididos entre os dois viraram duas despesas ("… (parte da
  Suellen)"). Importação grande: SQL numa transação que aborta se o projeto já tiver lançamentos e
  confere contagem + saldo pela view antes do `commit`.

