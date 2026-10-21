-- Registro de atividade: uma linha curta por criação, edição ou exclusão de
-- despesa ou acerto. Alimenta a tela Atividades (e, depois, as notificações).
--
-- Não é cópia de versões: guarda quem fez, o quê, um resumo para exibir e, na
-- edição, só os campos que mudaram (antes → depois). Reordenar (sort_key) não
-- conta como edição.

create table public.activity_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor uuid references public.profiles (id),
  entity text not null check (entity in ('expense', 'settlement')),
  entity_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  -- Resumo para exibir (estado depois da ação; na exclusão, o que foi apagado).
  summary jsonb not null,
  -- Só em 'updated': { campo: [antes, depois] }.
  changes jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_recent_idx on public.activity_log (created_at desc);
create index activity_log_project_idx on public.activity_log (project_id, created_at desc);

alter table public.activity_log enable row level security;

-- Só leitura pelo app; quem escreve é o gatilho abaixo.
create policy activity_select on public.activity_log for select using (is_project_member(project_id));
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

create or replace function public.log_activity ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_entity text := case tg_table_name when 'expenses' then 'expense' else 'settlement' end;
  v_summary jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_actor uuid := auth.uid();
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  -- Projeto sendo excluído inteiro: o registro dele vai junto (cascade), sem
  -- gerar uma linha de "apagou" por despesa.
  if tg_op = 'DELETE' and not exists (select 1 from projects where id = old.project_id) then
    return old;
  end if;

  if v_entity = 'expense' then
    v_summary := jsonb_build_object(
      'description', v_row.description,
      'amount', v_row.amount,
      'currency', v_row.currency,
      'paid_by', v_row.paid_by,
      'spent_on', v_row.spent_on,
      'category', (select name from categories where id = v_row.category_id)
    );
    if tg_op = 'UPDATE' then
      if old.description is distinct from new.description then
        v_changes := v_changes || jsonb_build_object('description', jsonb_build_array(old.description, new.description));
      end if;
      if old.amount is distinct from new.amount or old.currency is distinct from new.currency then
        v_changes := v_changes || jsonb_build_object('amount', jsonb_build_array(
          jsonb_build_object('amount', old.amount, 'currency', old.currency),
          jsonb_build_object('amount', new.amount, 'currency', new.currency)));
      end if;
      if old.paid_by is distinct from new.paid_by then
        v_changes := v_changes || jsonb_build_object('paid_by', jsonb_build_array(old.paid_by, new.paid_by));
      end if;
      if old.spent_on is distinct from new.spent_on then
        v_changes := v_changes || jsonb_build_object('spent_on', jsonb_build_array(old.spent_on, new.spent_on));
      end if;
      if old.category_id is distinct from new.category_id then
        v_changes := v_changes || jsonb_build_object('category', jsonb_build_array(
          (select name from categories where id = old.category_id),
          (select name from categories where id = new.category_id)));
      end if;
    end if;
  else
    v_summary := jsonb_build_object(
      'from_user', v_row.from_user,
      'to_user', v_row.to_user,
      'amount_cents', v_row.amount_cents,
      'settled_on', v_row.settled_on
    );
    if tg_op = 'UPDATE' then
      if old.amount_cents is distinct from new.amount_cents then
        v_changes := v_changes || jsonb_build_object('amount_cents', jsonb_build_array(old.amount_cents, new.amount_cents));
      end if;
      if old.from_user is distinct from new.from_user or old.to_user is distinct from new.to_user then
        v_changes := v_changes || jsonb_build_object('direction', jsonb_build_array(
          jsonb_build_array(old.from_user, old.to_user), jsonb_build_array(new.from_user, new.to_user)));
      end if;
      if old.settled_on is distinct from new.settled_on then
        v_changes := v_changes || jsonb_build_object('settled_on', jsonb_build_array(old.settled_on, new.settled_on));
      end if;
    end if;
  end if;

  -- Edição sem mudança que importe (ex.: só reordenou): não registra.
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return new;
  end if;

  insert into activity_log (project_id, actor, entity, entity_id, action, summary, changes)
  values (
    v_row.project_id,
    -- Sem usuário logado (ex.: ajuste direto no banco): na criação usa quem consta como autor.
    coalesce(v_actor, case when tg_op = 'INSERT' then v_row.created_by end),
    v_entity,
    v_row.id,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    v_summary,
    case when tg_op = 'UPDATE' then v_changes end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.log_activity () from public, anon, authenticated;

create trigger expenses_activity
after insert or update or delete on public.expenses
for each row execute function public.log_activity ();

create trigger settlements_activity
after insert or update or delete on public.settlements
for each row execute function public.log_activity ();

-- Carga inicial: o que já existe entra como "criou", na data em que foi lançado.
insert into public.activity_log (project_id, actor, entity, entity_id, action, summary, created_at)
select e.project_id, e.created_by, 'expense', e.id, 'created',
       jsonb_build_object('description', e.description, 'amount', e.amount, 'currency', e.currency,
                          'paid_by', e.paid_by, 'spent_on', e.spent_on,
                          'category', (select name from public.categories c where c.id = e.category_id)),
       e.created_at
from public.expenses e;

insert into public.activity_log (project_id, actor, entity, entity_id, action, summary, created_at)
select s.project_id, s.created_by, 'settlement', s.id, 'created',
       jsonb_build_object('from_user', s.from_user, 'to_user', s.to_user,
                          'amount_cents', s.amount_cents, 'settled_on', s.settled_on),
       s.created_at
from public.settlements s;
