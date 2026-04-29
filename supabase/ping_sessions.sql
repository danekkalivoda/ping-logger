create table if not exists public.ping_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  device_name text not null,
  device_label text not null,
  session_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  url text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint ping_sessions_device_session_key unique (device_id, session_id)
);

alter table public.ping_sessions enable row level security;

drop policy if exists "anon can insert ping sessions" on public.ping_sessions;

create policy "anon can insert ping sessions"
on public.ping_sessions
for insert
to anon
with check (true);
