-- Патч #2: Списки (Покупки, Работа, Дом и т.д.)
-- Выполнить в SQL Editor Supabase один раз.

-- Таблица списков
create table if not exists lists (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  name text not null,
  icon text default '📋',     -- эмодзи
  color text default '#4f8cff', -- HEX цвета акцента
  position int default 0,
  archived boolean default false,
  created_at timestamptz default now()
);

create index if not exists lists_workspace_idx on lists (workspace_id, position);

-- Поле list_id у задач
alter table tasks add column if not exists list_id uuid references lists(id) on delete set null;
create index if not exists tasks_list_idx on tasks (list_id);

-- RLS на lists
alter table lists enable row level security;
drop policy if exists "lists_all" on lists;
create policy "lists_all" on lists for all
  using (workspace_id in (select my_workspaces()))
  with check (workspace_id in (select my_workspaces()));
