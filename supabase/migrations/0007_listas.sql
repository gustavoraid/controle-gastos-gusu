-- Listas compartilhadas (compras, tarefas de casa). Ficam fora dos projetos:
-- não têm divisão, moeda nem saldo. São sempre dos dois — quem pode é quem tem
-- perfil, e o cadastro já recusa uma terceira conta.
--
-- Ordem: sort_key maior = mais acima (mesma convenção das despesas no dia).
-- Concluído: done_at/done_by preenchidos; desmarcar volta à posição que tinha.

create or replace function public.is_app_user ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

revoke execute on function public.is_app_user () from public, anon;
grant execute on function public.is_app_user () to authenticated;

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  emoji text not null default '📝',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.list_items (
  -- id gerado no celular: com sinal ruim, reenviar a mesma linha não duplica.
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 200),
  sort_key double precision not null default 0,
  done_at timestamptz,
  done_by uuid references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint list_items_done_pair check ((done_at is null) = (done_by is null))
);
create index list_items_list_idx on public.list_items (list_id);

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

create policy lists_all on public.lists for all
  using (is_app_user()) with check (is_app_user());
create policy list_items_all on public.list_items for all
  using (is_app_user()) with check (is_app_user());

revoke all on public.lists, public.list_items from anon;
grant select, insert, update, delete on public.lists, public.list_items to authenticated;

-- Tempo real: o que um marca no mercado aparece no celular do outro.
alter publication supabase_realtime add table public.lists, public.list_items;
