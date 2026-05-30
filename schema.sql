-- Схема БД ежедневника
-- Выполнить в Supabase: SQL Editor → New Query → вставить → Run

-- ============================================================
-- Расширения
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- Таблица: команды/семья (для разделения данных)
-- ============================================================
create table if not exists workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Связь пользователь ↔ workspace (один юзер может быть в нескольких)
create table if not exists workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member', -- 'owner' | 'member'
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- ============================================================
-- Таблица: задачи (Сейчас/Сегодня/Завтра/Неделя)
-- ============================================================
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  text text not null,
  scheduled_at timestamptz,            -- когда задача (null = без даты)
  duration_minutes int,                -- сколько займёт (опционально)
  repeat text,                          -- 'daily'|'weekly'|'monthly'|null
  done boolean default false,
  done_at timestamptz,
  priority int default 0,               -- 0 обычная, 1 важная, 2 срочная
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tasks_workspace_scheduled_idx
  on tasks (workspace_id, scheduled_at);

-- ============================================================
-- Таблица: мысли (свободные заметки с датой)
-- ============================================================
create table if not exists notes (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  text text not null,
  created_at timestamptz default now()
);

create index if not exists notes_workspace_created_idx
  on notes (workspace_id, created_at desc);

-- ============================================================
-- Таблица: жизнь (долгосрочные цели/чеклисты)
-- ============================================================
create table if not exists goals (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  done boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security): пользователь видит только свои workspaces
-- ============================================================
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table tasks enable row level security;
alter table notes enable row level security;
alter table goals enable row level security;

-- Helper: список workspace_id для текущего юзера
create or replace function my_workspaces() returns setof uuid as $$
  select workspace_id from workspace_members where user_id = auth.uid()
$$ language sql security definer stable;

-- Policies
drop policy if exists "ws_select" on workspaces;
create policy "ws_select" on workspaces for select
  using (id in (select my_workspaces()));

drop policy if exists "ws_insert" on workspaces;
create policy "ws_insert" on workspaces for insert
  with check (true);

drop policy if exists "wm_select" on workspace_members;
create policy "wm_select" on workspace_members for select
  using (user_id = auth.uid() or workspace_id in (select my_workspaces()));

drop policy if exists "wm_insert" on workspace_members;
create policy "wm_insert" on workspace_members for insert
  with check (user_id = auth.uid() or workspace_id in (select my_workspaces()));

drop policy if exists "tasks_all" on tasks;
create policy "tasks_all" on tasks for all
  using (workspace_id in (select my_workspaces()))
  with check (workspace_id in (select my_workspaces()));

drop policy if exists "notes_all" on notes;
create policy "notes_all" on notes for all
  using (workspace_id in (select my_workspaces()))
  with check (workspace_id in (select my_workspaces()));

drop policy if exists "goals_all" on goals;
create policy "goals_all" on goals for all
  using (workspace_id in (select my_workspaces()))
  with check (workspace_id in (select my_workspaces()));
