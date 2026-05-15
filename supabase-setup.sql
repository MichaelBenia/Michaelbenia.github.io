-- Supabase setup for Wine Order Count.
-- These public RLS policies are for personal testing only and are not secure
-- for public production use. Add authentication and store-scoped policies
-- before sharing this app broadly.

create table if not exists store_app_state (
  store_number text primary key,
  app_state jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists stores (
  store_number text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inventory_adjustment_history (
  id uuid primary key default gen_random_uuid(),
  store_number text not null,
  product_id text not null,
  product_name text not null,
  change_amount integer not null,
  quantity_type text not null default 'unit',
  created_at timestamptz not null default now(),
  user_id uuid null,
  user_name text null,
  source text null default 'manual_adjustment'
);

alter table inventory_adjustment_history
add column if not exists quantity_type text not null default 'unit';

alter table store_app_state enable row level security;
alter table stores enable row level security;
alter table inventory_adjustment_history enable row level security;

create policy "Allow public read"
on store_app_state
for select
using (true);

create policy "Allow public insert"
on store_app_state
for insert
with check (true);

create policy "Allow public update"
on store_app_state
for update
using (true)
with check (true);

create policy "Allow public store read"
on stores
for select
using (true);

create policy "Allow public store insert"
on stores
for insert
with check (true);

create policy "Allow public store update"
on stores
for update
using (true)
with check (true);

create policy "Allow public inventory history read"
on inventory_adjustment_history
for select
using (true);

create policy "Allow public inventory history insert"
on inventory_adjustment_history
for insert
with check (true);

create index if not exists inventory_adjustment_history_store_product_created_idx
on inventory_adjustment_history (store_number, product_id, created_at desc);

-- Enable Realtime for cross-device live updates.
-- If this table is already in the publication, Supabase/Postgres may report
-- that it already exists; that is safe to ignore.
alter publication supabase_realtime add table store_app_state;
