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
  source text null default 'manual_adjustment',
  event_type text not null default 'adjustment',
  transfer_direction text null,
  case_quantity integer null,
  unit_equivalent integer null
);

create table if not exists global_product_sale_status (
  product_id text primary key,
  on_sale boolean not null default false,
  sale_price numeric null,
  sale_note text null,
  sale_start timestamptz null,
  sale_end timestamptz null,
  updated_at timestamptz default now()
);

alter table inventory_adjustment_history
add column if not exists quantity_type text not null default 'unit';

alter table inventory_adjustment_history
add column if not exists event_type text not null default 'adjustment';

alter table inventory_adjustment_history
add column if not exists transfer_direction text null;

alter table inventory_adjustment_history
add column if not exists case_quantity integer null;

alter table inventory_adjustment_history
add column if not exists unit_equivalent integer null;

alter table store_app_state enable row level security;
alter table stores enable row level security;
alter table inventory_adjustment_history enable row level security;
alter table global_product_sale_status enable row level security;

drop policy if exists "Allow public read" on store_app_state;
drop policy if exists "Allow public insert" on store_app_state;
drop policy if exists "Allow public update" on store_app_state;
drop policy if exists "Allow public store read" on stores;
drop policy if exists "Allow public store insert" on stores;
drop policy if exists "Allow public store update" on stores;
drop policy if exists "Allow public inventory history read" on inventory_adjustment_history;
drop policy if exists "Allow public inventory history insert" on inventory_adjustment_history;
drop policy if exists "Allow public global sale read" on global_product_sale_status;
drop policy if exists "Allow public global sale insert" on global_product_sale_status;
drop policy if exists "Allow public global sale update" on global_product_sale_status;

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

create policy "Allow public global sale read"
on global_product_sale_status
for select
using (true);

create policy "Allow public global sale insert"
on global_product_sale_status
for insert
with check (true);

create policy "Allow public global sale update"
on global_product_sale_status
for update
using (true)
with check (true);

grant select, insert, update on store_app_state to anon, authenticated;
grant select, insert, update on stores to anon, authenticated;
grant select, insert on inventory_adjustment_history to anon, authenticated;
grant select, insert, update on global_product_sale_status to anon, authenticated;

create index if not exists inventory_adjustment_history_store_product_created_idx
on inventory_adjustment_history (store_number, product_id, created_at desc);

create index if not exists global_product_sale_status_on_sale_idx
on global_product_sale_status (on_sale);

-- Enable Realtime for cross-device live updates.
do $$
begin
  alter publication supabase_realtime add table store_app_state;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table global_product_sale_status;
exception
  when duplicate_object then null;
end $$;
