-- Патч #1: атомарное создание workspace + членства
-- Выполнить в SQL Editor Supabase один раз.

create or replace function init_workspace(ws_name text default 'Мой ежедневник')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into workspaces (name) values (ws_name)
  returning id into new_id;

  insert into workspace_members (workspace_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

grant execute on function init_workspace(text) to authenticated;

-- Подчистка: если у текущего юзера уже есть workspace без членства (от первой сломанной попытки),
-- свяжем их (на случай если осиротевшие записи остались):
-- (не критично, можно пропустить)
