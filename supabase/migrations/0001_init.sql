-- Gastos do Casal — schema completo.
-- Rode uma vez no SQL Editor de um projeto Supabase novo, DEPOIS de criar as duas
-- contas em Authentication → Users → Add user (veja o README).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- As duas pessoas do app (o cadastro recusa uma terceira).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  emoji text not null default '💰',
  created_by uuid not null default auth.uid() references public.profiles (id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Quem está no projeto (sempre os dois) e o peso de cada um na divisão.
-- Pesos são livres: 1 e 2 = um terço e dois terços; 60 e 40 = 60% e 40%.
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weight numeric(9, 4) not null default 1 check (weight >= 0),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  emoji text not null default '📦',
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index categories_project_idx on public.categories (project_id, position);

-- Descrições prontas de cada categoria (de cada projeto).
create table public.category_suggestions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  text text not null check (length(trim(text)) between 1 and 120),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, text)
);
create index category_suggestions_category_idx on public.category_suggestions (category_id, position);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid not null,
  -- Obrigatória. Categoria com despesas não pode ser excluída (só ocultada). "No action"
  -- (e não "restrict") para que excluir o projeto inteiro ainda funcione em cascata.
  category_id uuid not null references public.categories (id),
  spent_on date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, paid_by) references public.project_members (project_id, user_id)
);
create index expenses_project_date_idx on public.expenses (project_id, spent_on desc, created_at desc);
create index expenses_category_idx on public.expenses (category_id);

-- Acerto de contas: from_user pagou to_user.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  from_user uuid not null,
  to_user uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  settled_on date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  foreign key (project_id, from_user) references public.project_members (project_id, user_id),
  foreign key (project_id, to_user) references public.project_members (project_id, user_id)
);
create index settlements_project_date_idx on public.settlements (project_id, settled_on desc);

-- A categoria da despesa tem que ser do mesmo projeto da despesa.
create or replace function public.check_expense_category ()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is null then
    raise exception 'categoria é obrigatória';
  end if;
  if not exists (select 1 from categories where id = new.category_id and project_id = new.project_id) then
    raise exception 'categoria não pertence a este projeto';
  end if;
  return new;
end;
$$;

create trigger expenses_category_same_project
before insert or update of category_id, project_id on public.expenses
for each row execute function public.check_expense_category ();

-- ---------------------------------------------------------------------------
-- Views (calculadas na leitura; não guardam nada)
-- ---------------------------------------------------------------------------

-- Parte de cada membro em cada despesa, pela proporção ATUAL do projeto: mudar a
-- proporção recalcula tudo. Centavo que sobra do arredondamento vai para o maior
-- resto (empate: menor user_id) — mesma regra de expenseShares() em src/lib/split.ts.
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

-- Saldo por pessoa no projeto (positivo = tem a receber):
-- pagou − sua parte + acertos enviados − acertos recebidos.
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

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

create or replace function public.is_project_member (pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members where project_id = pid and user_id = auth.uid()
  );
$$;

-- Perfil criado no cadastro da conta. No máximo duas contas.
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  lock table profiles in exclusive mode;
  if (select count(*) from profiles) >= 2 then
    raise exception 'limite de contas: este app é só para duas pessoas';
  end if;

  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user ();

-- Cria o projeto já com as duas pessoas. Com p_copy_from, copia proporção,
-- categorias e sugestões de outro projeto; sem, usa a base padrão de casa.
create or replace function public.create_project (p_name text, p_emoji text, p_copy_from uuid default null)
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
  if (select count(*) from profiles) < 2 then
    raise exception 'crie as duas contas antes do primeiro projeto';
  end if;
  if p_copy_from is not null and not is_project_member(p_copy_from) then
    raise exception 'sem acesso ao projeto de origem';
  end if;

  insert into projects (name, emoji, created_by)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '💰'), v_uid)
  returning id into v_id;

  insert into project_members (project_id, user_id, weight)
  select v_id, p.id, coalesce(src.weight, 1)
  from profiles p
  left join project_members src on src.project_id = p_copy_from and src.user_id = p.id;

  if p_copy_from is not null then
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

-- ---------------------------------------------------------------------------
-- Segurança (RLS): cada um só vê e grava projetos de que é membro
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.categories enable row level security;
alter table public.category_suggestions enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;

create policy profiles_select on public.profiles for select using (auth.uid() is not null);
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- Projetos: criação só pela função create_project. Qualquer um dos dois exclui.
create policy projects_select on public.projects for select using (is_project_member(id));
create policy projects_update on public.projects for update using (is_project_member(id));
create policy projects_delete on public.projects for delete using (is_project_member(id));

-- Membros: entram só pela create_project; ninguém sai; qualquer um ajusta o peso.
create policy members_select on public.project_members for select using (is_project_member(project_id));
create policy members_update on public.project_members for update using (is_project_member(project_id));

create policy categories_all on public.categories for all
  using (is_project_member(project_id)) with check (is_project_member(project_id));

create policy suggestions_all on public.category_suggestions for all
  using (exists (select 1 from categories c where c.id = category_id and is_project_member(c.project_id)))
  with check (exists (select 1 from categories c where c.id = category_id and is_project_member(c.project_id)));

create policy expenses_all on public.expenses for all
  using (is_project_member(project_id)) with check (is_project_member(project_id));

create policy settlements_all on public.settlements for all
  using (is_project_member(project_id)) with check (is_project_member(project_id));

grant execute on function public.create_project (text, text, uuid) to authenticated;
grant select on public.expense_shares to authenticated;
grant select on public.project_balances to authenticated;

-- Tempo real: o celular de um atualiza quando o outro lança algo.
alter publication supabase_realtime add table public.expenses, public.settlements, public.project_members, public.categories;
