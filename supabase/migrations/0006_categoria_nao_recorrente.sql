-- Categoria "não recorrente" (compras pontuais, reformas...): no Resumo do mês os
-- gastos dela aparecem separados dos recorrentes. Padrão: recorrente.
alter table public.categories
  add column non_recurring boolean not null default false;

-- Duplicar projeto passa a copiar a marcação. Mesmo corpo da 0001, só com a coluna nova.
create or replace function public.create_project (
  p_name text,
  p_emoji text,
  p_type text,
  p_copy_from uuid default null
)
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

  insert into projects (name, emoji, type, created_by, default_currency)
  values (
    trim(p_name),
    coalesce(nullif(p_emoji, ''), '💰'),
    p_type,
    v_uid,
    coalesce((select default_currency from projects where id = p_copy_from), 'BRL')
  )
  returning id into v_id;

  -- Real sempre; ao copiar, também as moedas extras com a mesma cotação.
  insert into project_currencies (project_id, code, rate) values (v_id, 'BRL', 1);
  insert into project_currencies (project_id, code, rate)
  select v_id, code, rate from project_currencies where project_id = p_copy_from and code <> 'BRL';

  insert into project_members (project_id, user_id, weight)
  select v_id, p.id, coalesce(src.weight, 1)
  from profiles p
  left join project_members src on src.project_id = p_copy_from and src.user_id = p.id;

  if p_copy_from is not null then
    for v_cat in
      select id, emoji, name, position, non_recurring from categories
      where project_id = p_copy_from and not archived
      order by position
    loop
      insert into categories (project_id, emoji, name, position, non_recurring)
      values (v_id, v_cat.emoji, v_cat.name, v_cat.position, v_cat.non_recurring)
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
