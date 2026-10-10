-- Gastos do Casal — schema inicial.
-- Aplique no SQL Editor do Supabase (projeto novo, separado de qualquer outro sistema).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  emoji text not null default '💰',
  invite_code text not null unique default encode(gen_random_bytes(5), 'hex'),
  created_by uuid not null default auth.uid() references public.profiles (id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- weight = peso na divisão padrão do projeto. A UI mostra em %, normalizando os pesos.
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

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid not null,
  category_id uuid references public.categories (id) on delete set null,
  spent_on date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Quem pagou precisa ser membro; impede sair do projeto deixando histórico órfão.
  foreign key (project_id, paid_by) references public.project_members (project_id, user_id)
);
create index expenses_project_date_idx on public.expenses (project_id, spent_on desc, created_at desc);

-- Quanto cada pessoa "consumiu" da despesa. Gravado por despesa, então mudar a
-- proporção do projeto depois não reescreve o histórico.
create table public.expense_splits (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, user_id)
);

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

-- ---------------------------------------------------------------------------
-- Helpers
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

-- Perfil criado automaticamente no cadastro (nome vem do metadata do signUp).
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Cria o projeto, adiciona o criador como membro e semeia as categorias do modelo.
create or replace function public.create_project (p_name text, p_emoji text, p_template text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_cats text[][];
  i int;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;

  insert into projects (name, emoji, created_by)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '💰'), v_uid)
  returning id into v_id;

  insert into project_members (project_id, user_id) values (v_id, v_uid);

  v_cats := case p_template
    when 'viagem' then array[
      ['✈️', 'Passagens'], ['🏨', 'Hospedagem'], ['🍽️', 'Alimentação'], ['🚕', 'Transporte'],
      ['🎟️', 'Passeios'], ['🛍️', 'Compras'], ['📦', 'Outros']]
    when 'vazio' then array[['📦', 'Outros']]
    else array[
      ['🛒', 'Mercado'], ['🍽️', 'Restaurante'], ['🏠', 'Casa'], ['💡', 'Contas'],
      ['🚗', 'Transporte'], ['💊', 'Saúde'], ['🎉', 'Lazer'], ['🐶', 'Pets'],
      ['🎁', 'Presentes'], ['📦', 'Outros']]
  end;

  for i in 1 .. array_length(v_cats, 1) loop
    insert into categories (project_id, emoji, name, position)
    values (v_id, v_cats[i][1], v_cats[i][2], i);
  end loop;

  return v_id;
end;
$$;

-- Entra num projeto pelo código de convite. Novo membro começa com peso 1.
create or replace function public.join_project (p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select id into v_id from projects where invite_code = lower(trim(p_code));
  if v_id is null then
    raise exception 'código de convite inválido';
  end if;

  insert into project_members (project_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  return v_id;
end;
$$;

-- Grava despesa + divisão numa transação só. p_id nulo = nova despesa.
-- p_splits: [{"user_id": "...", "amount_cents": 123}, ...] — a soma tem que bater.
create or replace function public.save_expense (
  p_id uuid,
  p_project_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_paid_by uuid,
  p_category_id uuid,
  p_spent_on date,
  p_splits jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_sum bigint;
  v_bad int;
begin
  if not is_project_member(p_project_id) then
    raise exception 'sem acesso a este projeto';
  end if;

  select coalesce(sum((s ->> 'amount_cents')::bigint), 0) into v_sum
  from jsonb_array_elements(p_splits) s;
  if v_sum <> p_amount_cents then
    raise exception 'a divisão (%) não bate com o valor (%)', v_sum, p_amount_cents;
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_splits) s
  where not exists (
    select 1 from project_members m
    where m.project_id = p_project_id and m.user_id = (s ->> 'user_id')::uuid
  );
  if v_bad > 0 then
    raise exception 'divisão inclui alguém que não é membro do projeto';
  end if;

  if v_id is null then
    insert into expenses (project_id, description, amount_cents, paid_by, category_id, spent_on, created_by)
    values (p_project_id, trim(p_description), p_amount_cents, p_paid_by, p_category_id, p_spent_on, auth.uid())
    returning id into v_id;
  else
    update expenses
    set description = trim(p_description),
        amount_cents = p_amount_cents,
        paid_by = p_paid_by,
        category_id = p_category_id,
        spent_on = p_spent_on,
        updated_at = now()
    where id = v_id and project_id = p_project_id;
    if not found then
      raise exception 'despesa não encontrada';
    end if;
    delete from expense_splits where expense_id = v_id;
  end if;

  insert into expense_splits (expense_id, user_id, amount_cents)
  select v_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint
  from jsonb_array_elements(p_splits) s
  where (s ->> 'amount_cents')::bigint > 0;

  return v_id;
end;
$$;

-- Saldo líquido por pessoa no projeto (positivo = tem a receber).
-- Agregado no banco para não depender de baixar todas as despesas.
create or replace view public.project_balances
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
  select sum(s.amount_cents) total from expense_splits s
  join expenses e on e.id = s.expense_id
  where e.project_id = m.project_id and s.user_id = m.user_id
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
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;

-- Perfis: o próprio e de quem divide algum projeto comigo.
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from project_members a
    join project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- Projetos: criação só pela RPC create_project.
create policy projects_select on public.projects for select using (is_project_member(id));
create policy projects_update on public.projects for update using (is_project_member(id));
create policy projects_delete on public.projects for delete using (created_by = auth.uid());

-- Membros: entrada só pela RPC join_project; qualquer membro ajusta a proporção.
create policy members_select on public.project_members for select using (is_project_member(project_id));
create policy members_update on public.project_members for update using (is_project_member(project_id));
create policy members_delete on public.project_members for delete using (user_id = auth.uid());

create policy categories_all on public.categories for all
  using (is_project_member(project_id)) with check (is_project_member(project_id));

create policy expenses_all on public.expenses for all
  using (is_project_member(project_id)) with check (is_project_member(project_id));

create policy splits_all on public.expense_splits for all
  using (exists (select 1 from expenses e where e.id = expense_id and is_project_member(e.project_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_project_member(e.project_id)));

create policy settlements_all on public.settlements for all
  using (is_project_member(project_id)) with check (is_project_member(project_id));

grant execute on function public.create_project (text, text, text) to authenticated;
grant execute on function public.join_project (text) to authenticated;
grant execute on function public.save_expense (uuid, uuid, text, bigint, uuid, uuid, date, jsonb) to authenticated;
grant select on public.project_balances to authenticated;

-- Tempo real: o celular de um atualiza quando o outro lança algo.
alter publication supabase_realtime add table public.expenses, public.settlements, public.project_members, public.categories;
