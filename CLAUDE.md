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

## Decisões de produto (já combinadas com o dono)

- Pessoas: o app nunca diz "Eu", "Você" nem "vocês" — sempre o nome curto (Gu / Su), vindo de
  `shortName()` (`src/lib/people.ts`, duas primeiras letras do `display_name`) aplicado no
  mapeamento dos perfis em `api.ts`. Cores fixas por ordem dos membros: `PERSON_COLORS` (azul / rosa).
- Por tipo de projeto (`src/screens/Project.tsx`):
  - Casa: abas `Lançamentos | Evolução` (sem Resumo); saldo + Acertar numa faixa acima das abas.
    Lançamentos: mês pulando meses vazios, sem agrupar por dia, sem reordenar. Evolução
    (`src/screens/Evolution.tsx`, `src/lib/evolution.ts`): seletor de período (últimos 12 meses /
    anos), recorrente × não recorrente (`categories.non_recurring`), média dos meses fechados a
    partir do 1º lançamento, chips de categoria ("Todas" padrão). Mês da Evolução é só dela.
  - Viagem: sem navegação por mês, "⇅ Reordenar" no cabeçalho de cada dia (o modo vale para todos
    os dias, um Concluir só), Resumo com gasto por dia (`projects.trip_days`, sempre total ÷ dias).
  - Outros: navegação por mês + reordenar como viagem.
  - Onde há mês: arrastar para o lado troca o mês (`swipeStep`), e o mês na tela fica em
    `sessionStorage` por projeto — salvar uma despesa abre o mês dela.
- Ajustes do projeto: tudo vira rascunho e grava num "Salvar" só no topo (`src/lib/settingsDraft.ts`
  → `planChanges` → `applySettings` em `api.ts`, exclusões primeiro). Campo novo de projeto ou
  categoria tem que entrar nos três. Arquivar/excluir projeto valem na hora.
- Ícone de categoria/projeto: um único emoji ou letra (`firstGrapheme`).
- Atividades: o banco grava `activity_log` por gatilho (criar/editar/apagar despesa ou acerto;
  reordenar não conta). O sino da tela inicial conta ações da outra pessoa desde a última visita.
- Lançamento: valor + chip Gu/Su (um toque alterna) → Quando → Categoria (recolhe ao escolher) →
  Descrição (só depois da categoria, sugestões antes do campo livre).
- Tela inicial: por projeto, média/mês (Casa/Outros, mesma conta da Evolução — `monthlyAverage`)
  ou gasto por dia (Viagem); saldo só como linha discreta. Abaixo, a seção Listas.
- Abrir o app sem rota vai para o último projeto OU lista aberto (`launchRoute`, `gc:ultimoLugar`).
  `#/add/casa` lança direto no primeiro projeto Casa ativo.

## Listas compartilhadas (compras, tarefas)

- Entidade própria (`lists`, `list_items`, migration `0007`), não é tipo de projeto: sem divisão,
  moeda nem saldo. RLS `is_app_user()` (tem perfil = é uma das duas contas). Rotas `#/l/:id`,
  `#/l/:id/config`, `#/nova-lista`.
- Item novo entra no FIM (`newItemKey`); arrastar pela alça ≡ sempre ligado (sort_key maior = mais
  acima, `reorderKeys`). Concluir desce para "Concluídos" (recolhido, com quem/quando, "Desfazer");
  desmarcar volta à posição antiga. "Limpar concluídos" apaga.
- Sinal ruim é requisito: toda mudança passa por `src/lib/listQueue.ts` (fila no `localStorage`,
  operações idempotentes com id gerado no celular) e aparece na hora via `applyOps`. Tempo real:
  exclusões escutadas sem filtro (o filtro não entrega DELETE).
- Ideias aprovadas para uma v2 (não implementar sem o dono pedir):
  - A. Responsável por item (chip Gu/Su, um toque alterna) — para tarefas.
  - B. Sugestões ao digitar com itens já concluídos daquela lista.
  - C. "Lançar despesa" a partir da lista (abre Nova despesa na Casa com "Mercado").
  - D. Tarefas recorrentes (volta a ficar pendente N dias depois de concluída).
  - E. Prazo nos itens.
  - F. Seções dentro da lista (o dono achou que a ordem livre resolve; só se pedir).
  - G. Listas no sino de atividades (risco de virar ruído no mercado).

## PWA, ícones e atalhos

- Site: https://gustavoraid.github.io/controle-gastos-gusu/ (o caminho manteve o nome antigo de
  propósito: mudar quebra os apps já instalados).
- `nova-despesa.html` é uma 2ª página (entrada extra no `vite.config.ts`) com manifesto/ícone
  próprios para o atalho "+ Casa" no iPhone; o SW guarda cada página no próprio caminho. No
  Android o atalho é o `shortcuts` do manifesto; Xiaomi não deixa arrastar atalho para a tela e o
  Chrome não instala a 2ª página (mesmo escopo) — lá o caminho é "Criar atalho" no Chrome.
- iPhone: nome e ícone do app ficam gravados ao adicionar à Tela de Início (mudou → remover e
  adicionar de novo), e cada ícone tem armazenamento próprio (o "+ Casa" pede login uma vez).
- Ícones: não há `rsvg`/ImageMagick com SVG no container; gere os PNG renderizando o SVG no
  Chromium do Playwright. PNG sem transparência (iOS pinta de preto), `maskable` com o desenho
  nos 80% centrais. Mudou ícone/manifesto → suba `CACHE` no `sw.js`.

## Como o dono trabalha

- Responde em pt-BR, direto; manda vários ajustes por mensagem. "Merge" = pode fazer o merge (e,
  se o PR tiver migration, aplicar antes — já confirmou isso). Antes de `create or replace` de
  função em produção, compare o corpo atual (`md5(prosrc)`) com o do repositório.
- Mudança visual: mande prévia (screenshot com dados falsos) junto do PR; para ícone/nome ele
  pede opções antes de implementar.

