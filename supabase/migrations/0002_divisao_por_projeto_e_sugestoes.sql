-- Proporção recalculada pelo projeto, descrições sugeridas e duplicar projeto.
-- Rode DEPOIS da 0001, no SQL Editor do Supabase.
--
-- 1. A divisão deixa de ser gravada por despesa (sai expense_splits): a parte de
--    cada pessoa é sempre calculada pela proporção ATUAL do projeto. Mudar a
--    proporção recalcula todas as despesas, inclusive as antigas.
-- 2. category_suggestions: descrições prontas por categoria.
-- 3. create_project pode copiar outro projeto (pessoas, proporção, categorias e
--    sugestões). Sem cópia, começa com a base padrão de casa.

-- ---------------------------------------------------------------------------
-- 1. Divisão calculada (sem expense_splits)
-- ---------------------------------------------------------------------------

drop view if exists public.project_balances;
drop function if exists public.save_expense (uuid, uuid, text, bigint, uuid, uuid, date, jsonb);
drop table if exists public.expense_splits;

-- Parte de cada membro em cada despesa, pela proporção atual do projeto.
-- Centavos que sobram do arredondamento vão para o maior resto (empate: menor
-- user_id) — mesma regra de expenseShares() em src/lib/split.ts.
create view public.expense_shares
with (security_invoker = true) as
with base as (
  select e.id as expense_id,
         e.project_id,
         e.amount_cents,
         m.user_id,
         case
           when sum(m.weight) over w > 0 then e.amount_cents * m.weight / sum(m.weight) over w
           else e.amount_cents::numeric / count(*) over w
         end as raw
  from expenses e
  join project_members m on m.project_id = e.project_id
  window w as (partition by e.id)
),
ranked as (
  select *,
         floor(raw) as fl,
         row_number() over (partition by expense_id order by raw - floor(raw) desc, user_id) as rk
  from base
)
select expense_id,
       project_id,
       user_id,
       (fl + case when rk <= amount_cents - sum(fl) over (partition by expense_id) then 1 else 0 end)::bigint
         as share_cents
from ranked;

-- Saldo líquido por pessoa no projeto (positivo = tem a receber).
create view public.project_balances
with (security_invoker = true) as
select m.project_id,
       m.user_id,
       coalesce(paid.total, 0)
         - coalesce(owed.total, 0)
         + coalesce(sent.total, 0)
         - coalesce(received.total, 0) as net_cents
from project_members m
left join lateral (
  select sum(e.amount_cents) total from expenses e
  where e.project_id = m.project_id and e.paid_by = m.user_id
) paid on true
left join lateral (
  select sum(s.share_cents) total from expense_shares s
  where s.project_id = m.project_id and s.user_id = m.user_id
) owed on true
left join lateral (
  select sum(t.amount_cents) total from settlements t
  where t.project_id = m.project_id and t.from_user = m.user_id
) sent on true
left join lateral (
  select sum(t.amount_cents) total from settlements t
  where t.project_id = m.project_id and t.to_user = m.user_id
) received on true;

grant select on public.expense_shares to authenticated;
grant select on public.project_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Descrições sugeridas
-- ---------------------------------------------------------------------------

create table public.category_suggestions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  text text not null check (length(trim(text)) between 1 and 120),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, text)
);
create index category_suggestions_category_idx on public.category_suggestions (category_id, position);

alter table public.category_suggestions enable row level security;

create policy suggestions_all on public.category_suggestions for all
  using (exists (select 1 from categories c where c.id = category_id and is_project_member(c.project_id)))
  with check (exists (select 1 from categories c where c.id = category_id and is_project_member(c.project_id)));

-- ---------------------------------------------------------------------------
-- 3. Criar projeto (do zero ou copiando outro)
-- ---------------------------------------------------------------------------

drop function if exists public.create_project (text, text, text);

create function public.create_project (p_name text, p_emoji text, p_copy_from uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_seed jsonb;
  v_cat record;
  v_cat_id uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;
  if p_copy_from is not null and not is_project_member(p_copy_from) then
    raise exception 'sem acesso ao projeto de origem';
  end if;

  insert into projects (name, emoji, created_by)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '💰'), v_uid)
  returning id into v_id;

  if p_copy_from is not null then
    -- Mesmas pessoas e mesma proporção: não precisa convidar de novo.
    insert into project_members (project_id, user_id, weight)
    select v_id, user_id, weight from project_members where project_id = p_copy_from;

    for v_cat in
      select id, emoji, name, position from categories
      where project_id = p_copy_from and not archived
      order by position
    loop
      insert into categories (project_id, emoji, name, position)
      values (v_id, v_cat.emoji, v_cat.name, v_cat.position)
      returning id into v_cat_id;

      insert into category_suggestions (category_id, text, position)
      select v_cat_id, text, position from category_suggestions where category_id = v_cat.id;
    end loop;

    return v_id;
  end if;

  insert into project_members (project_id, user_id) values (v_id, v_uid);

  -- Base padrão (e = emoji, n = nome, s = descrições sugeridas). Tudo editável depois.
  v_seed := '[
    {"e": "🛒", "n": "Mercado", "s": ["Supermercado", "Feira", "Hortifruti", "Açougue", "Padaria"]},
    {"e": "🍽️", "n": "Restaurante", "s": ["Almoço", "Jantar", "Delivery", "Lanche", "Café"]},
    {"e": "🏠", "n": "Casa", "s": ["Aluguel", "Condomínio", "IPTU", "Diarista", "Manutenção", "Utensílios"]},
    {"e": "💡", "n": "Contas", "s": ["Luz", "Água", "Gás", "Internet", "Celular", "Streaming"]},
    {"e": "🚗", "n": "Transporte", "s": ["Combustível", "Uber", "Estacionamento", "Pedágio", "Manutenção do carro"]},
    {"e": "💊", "n": "Saúde", "s": ["Farmácia", "Consulta", "Exames", "Plano de saúde"]},
    {"e": "🎉", "n": "Lazer", "s": ["Cinema", "Bar", "Passeio", "Show"]},
    {"e": "🐶", "n": "Pets", "s": ["Ração", "Veterinário", "Banho e tosa"]},
    {"e": "🎁", "n": "Presentes", "s": ["Aniversário", "Natal"]},
    {"e": "📦", "n": "Outros", "s": []}
  ]'::jsonb;

  for v_cat in select value as c, ordinality as pos from jsonb_array_elements(v_seed) with ordinality loop
    insert into categories (project_id, emoji, name, position)
    values (v_id, v_cat.c ->> 'e', v_cat.c ->> 'n', v_cat.pos)
    returning id into v_cat_id;

    insert into category_suggestions (category_id, text, position)
    select v_cat_id, s.value, s.ordinality
    from jsonb_array_elements_text(v_cat.c -> 's') with ordinality s;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.create_project (text, text, uuid) to authenticated;
