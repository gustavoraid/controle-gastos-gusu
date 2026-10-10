-- Reforço apontado pelo Security Advisor do Supabase (aplicado depois do 0001).
--
-- 1. search_path fixo nas funções que não tinham (evita que alguém troque o
--    schema de busca para sequestrar uma chamada).
-- 2. Funções SECURITY DEFINER só podem ser chamadas por quem está logado — e a
--    do gatilho de cadastro por ninguém via API.

alter function public.currency_decimals (text) set search_path = public;
alter function public.check_project_currency () set search_path = public;
alter function public.check_expense_category () set search_path = public;

revoke execute on function public.create_project (text, text, text, uuid) from public, anon;
grant execute on function public.create_project (text, text, text, uuid) to authenticated;

revoke execute on function public.is_project_member (uuid) from public, anon;
grant execute on function public.is_project_member (uuid) to authenticated;

-- Só o gatilho de cadastro usa (gatilhos não precisam de EXECUTE para disparar).
revoke execute on function public.handle_new_user () from public, anon, authenticated;
