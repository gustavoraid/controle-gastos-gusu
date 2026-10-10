-- Descrições sugeridas por categoria + tipo do projeto.
-- Rode DEPOIS da 0001, no SQL Editor do Supabase.

-- Tipo (modelo) com que o projeto foi criado.
alter table public.projects
  add column template text not null default 'casa'
  check (template in ('casa', 'viagem', 'vazio'));

-- Descrições prontas que aparecem como atalho ao escolher a categoria.
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

-- Recria create_project para gravar o tipo e semear categorias + sugestões.
create or replace function public.create_project (p_name text, p_emoji text, p_template text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tpl text := case when p_template in ('casa', 'viagem', 'vazio') then p_template else 'casa' end;
  v_id uuid;
  v_seed jsonb;
  v_cat record;
  v_cat_id uuid;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;

  insert into projects (name, emoji, created_by, template)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '💰'), v_uid, v_tpl)
  returning id into v_id;

  insert into project_members (project_id, user_id) values (v_id, v_uid);

  -- e = emoji, n = nome, s = descrições sugeridas
  v_seed := case v_tpl
    when 'viagem' then '[
      {"e": "✈️", "n": "Passagens", "s": []},
      {"e": "🏨", "n": "Hospedagem", "s": []},
      {"e": "🍽️", "n": "Alimentação", "s": []},
      {"e": "🚕", "n": "Transporte", "s": []},
      {"e": "🎟️", "n": "Passeios", "s": []},
      {"e": "🛍️", "n": "Compras", "s": []},
      {"e": "📦", "n": "Outros", "s": []}
    ]'::jsonb
    when 'vazio' then '[{"e": "📦", "n": "Outros", "s": []}]'::jsonb
    else '[
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
    ]'::jsonb
  end;

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
