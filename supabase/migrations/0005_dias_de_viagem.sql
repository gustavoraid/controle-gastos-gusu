-- Duração da viagem em dias, informada nos ajustes do projeto. Usada só no
-- Resumo para mostrar o gasto por dia (total e por categoria). Vazio = não
-- informado.
alter table public.projects
  add column trip_days integer check (trip_days between 1 and 366);
