-- App de exatamente duas pessoas: sem convite, todo projeto nasce com as duas.
-- Rode DEPOIS da 0002, no SQL Editor do Supabase.
--
-- - No máximo 2 contas: a terceira tentativa de cadastro é recusada.
-- - Todo projeto novo já inclui todas as contas (as duas).
-- - Quem cria a conta depois entra automaticamente nos projetos existentes (50/50).
-- - Sai o código de convite, a função join_project e a opção de sair do projeto.

-- ---------------------------------------------------------------------------
-- Cadastro: limite de 2 contas e entrada automática nos projetos
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trava contra corrida de dois cadastros simultâneos.
  lock table profiles in exclusive mode;
  if (select count(*) from profiles) >= 2 then
    raise exception 'limite de contas: este app é só para duas pessoas';
  end if;

  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );

  -- Projetos criados enquanto só existia uma conta: a segunda entra e a divisão
  -- volta para 50/50 (ajustável depois em Ajustes).
  update project_members set weight = 1
  where project_id in (select project_id from project_members group by project_id having count(*) = 1);

  insert into project_members (project_id, user_id, weight)
  select id, new.id, 1 from projects
  on conflict do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Criar projeto: sempre com as duas pessoas
-- ---------------------------------------------------------------------------

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
  if p_copy_from is not null and not is_project_member(p_copy_from) then
    raise exception 'sem acesso ao projeto de origem';
  end if;

  insert into projects (name, emoji, created_by)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '💰'), v_uid)
  returning id into v_id;

  -- Todas as contas entram; ao copiar, herda a proporção do projeto de origem.
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
-- Sem convite e sem sair do projeto
-- ---------------------------------------------------------------------------

drop function if exists public.join_project (text);
alter table public.projects drop column if exists invite_code;

drop policy if exists members_delete on public.project_members;

-- Qualquer um dos dois pode excluir um projeto (o app pede confirmação).
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using (is_project_member(id));
