-- Ordem das despesas dentro do dia: padrão "mais recente primeiro", com ajuste manual.
--
-- sort_key maior = mais acima no dia. Nasce com o instante do lançamento (então a
-- despesa nova fica no topo do dia); reordenar à mão só troca os sort_key das
-- despesas daquele dia entre si.

alter table public.expenses add column sort_key double precision;

-- Despesas existentes: instante de criação. Empates (várias gravadas no mesmo
-- comando, como uma importação) seguem a ordem física de inserção: a primeira
-- inserida fica no topo, como na lista de origem.
update public.expenses e
set sort_key = s.k
from (
  select id,
         extract(epoch from created_at)
           - (row_number() over (partition by created_at order by ctid) - 1) * 0.001 as k
  from public.expenses
) s
where s.id = e.id;

alter table public.expenses
  alter column sort_key set default extract(epoch from now()),
  alter column sort_key set not null;

create index expenses_project_day_order_idx on public.expenses (project_id, spent_on desc, sort_key desc);
