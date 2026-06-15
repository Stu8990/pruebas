-- InvestSmart · Schema completo
-- Ejecutar en: Supabase → SQL Editor → New query

-- ── Tabla principal de sesiones ──────────────────────────────
create table if not exists sessions (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  fecha           date not null,
  fase            text not null default '',
  valor_total_usd numeric(10,2) not null,
  rendimientos    jsonb not null default '{}',
  created_at      timestamptz default now()
);

alter table sessions enable row level security;
create policy "own_select" on sessions for select using (auth.uid() = user_id);
create policy "own_insert" on sessions for insert with check (auth.uid() = user_id);
create policy "own_update" on sessions for update using (auth.uid() = user_id);
create policy "own_delete" on sessions for delete using (auth.uid() = user_id);

create index if not exists idx_sessions_user_fecha
  on sessions(user_id, fecha asc, created_at asc);

