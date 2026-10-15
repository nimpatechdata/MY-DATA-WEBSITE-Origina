create extension if not exists pgcrypto;

create table if not exists public.storefront_orders (
  id text primary key,
  details jsonb not null,
  status text not null check (status in (
    'awaiting_payment', 'demo_pending', 'payment_failed', 'processing', 'paid',
    'paid_awaiting_delivery', 'delivered', 'delivery_failed', 'delivery_review'
  )),
  payment jsonb,
  delivery jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists storefront_orders_status_created_idx
  on public.storefront_orders (status, created_at desc);

create table if not exists public.storefront_bundle_prices (
  bundle_id text primary key,
  price_ghs numeric(12, 2) not null check (price_ghs > 0),
  updated_at timestamptz not null default now()
);

alter table public.storefront_bundle_prices enable row level security;
revoke all on public.storefront_bundle_prices from anon, authenticated;
grant all on public.storefront_bundle_prices to service_role;

create table if not exists public.storefront_admin_settings (
  id text primary key check (id = 'singleton'),
  admin_email text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.storefront_admin_settings enable row level security;
revoke all on public.storefront_admin_settings from anon, authenticated;
grant all on public.storefront_admin_settings to service_role;

alter table public.storefront_orders enable row level security;
revoke all on public.storefront_orders from anon, authenticated;
grant all on public.storefront_orders to service_role;

create table if not exists public.agent_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  membership_status text not null default 'pending'
    check (membership_status in ('pending', 'active', 'suspended')),
  wallet_balance numeric(12, 2) not null default 0 check (wallet_balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.agent_membership_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.agent_profiles(user_id) on delete cascade,
  paystack_reference text not null unique,
  amount numeric(12, 2) not null default 50 check (amount = 50),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  receipt_sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_prices (
  agent_id uuid not null references public.agent_profiles(user_id) on delete cascade,
  network text not null check (network in ('mtn', 'telecel', 'airteltigo')),
  size_gb numeric(7, 2) not null check (size_gb > 0),
  sale_price numeric(12, 2) not null check (sale_price > 0),
  updated_at timestamptz not null default now(),
  primary key (agent_id, network, size_gb)
);

create table if not exists public.agent_orders (
  id uuid primary key,
  agent_id uuid not null references public.agent_profiles(user_id),
  network text not null check (network in ('mtn', 'telecel', 'airteltigo')),
  size_gb numeric(7, 2) not null check (size_gb > 0),
  phone text not null,
  customer_email text not null,
  base_price numeric(12, 2) not null check (base_price > 0),
  sale_price numeric(12, 2) not null check (sale_price >= base_price),
  profit_amount numeric(12, 2) generated always as (sale_price - base_price) stored,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'payment_failed', 'paid', 'paid_awaiting_delivery', 'delivered', 'delivery_failed', 'delivery_review')),
  paystack_reference text not null unique,
  justice_reference text unique,
  provider_status text,
  receipt_sent_at timestamptz,
  failure_message text,
  failure_details jsonb,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_orders_agent_created_idx
  on public.agent_orders (agent_id, created_at desc);
create index if not exists agent_orders_status_idx
  on public.agent_orders (status, updated_at desc);

create table if not exists public.agent_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent_profiles(user_id) on delete cascade,
  order_id uuid unique references public.agent_orders(id),
  amount numeric(12, 2) not null,
  entry_type text not null check (entry_type in ('sale_profit', 'withdrawal', 'adjustment')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.agent_profiles enable row level security;
alter table public.agent_membership_payments enable row level security;
alter table public.agent_prices enable row level security;
alter table public.agent_orders enable row level security;
alter table public.agent_wallet_ledger enable row level security;

alter table public.agent_membership_payments
  add column if not exists receipt_sent_at timestamptz;
alter table public.agent_orders
  add column if not exists customer_email text;
alter table public.agent_orders
  add column if not exists receipt_sent_at timestamptz;
alter table public.agent_orders
  add column if not exists failure_details jsonb;

revoke all on public.agent_profiles from anon, authenticated;
revoke all on public.agent_membership_payments from anon, authenticated;
revoke all on public.agent_prices from anon, authenticated;
revoke all on public.agent_orders from anon, authenticated;
revoke all on public.agent_wallet_ledger from anon, authenticated;
grant all on public.agent_profiles to service_role;
grant all on public.agent_membership_payments to service_role;
grant all on public.agent_prices to service_role;
grant all on public.agent_orders to service_role;
grant all on public.agent_wallet_ledger to service_role;

create or replace function public.activate_agent_membership(p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.agent_membership_payments
  where paystack_reference = p_reference
  for update;

  if v_user_id is null then
    raise exception 'Membership payment not found';
  end if;

  update public.agent_membership_payments
    set status = 'paid', paid_at = coalesce(paid_at, now())
    where paystack_reference = p_reference;
  update public.agent_profiles
    set membership_status = 'active'
    where user_id = v_user_id and membership_status <> 'suspended';

  return v_user_id;
end;
$$;

create or replace function public.complete_agent_order(
  p_order_id uuid,
  p_agent_id uuid,
  p_justice_reference text,
  p_provider_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profit numeric(12, 2);
  v_entry_id uuid;
  v_current_status text;
begin
  select profit_amount, status into v_profit, v_current_status
  from public.agent_orders
  where id = p_order_id and agent_id = p_agent_id
  for update;

  if v_current_status is null then
    raise exception 'Agent order not found';
  end if;

  update public.agent_orders
    set status = 'delivered',
        justice_reference = coalesce(p_justice_reference, justice_reference),
        provider_status = p_provider_status,
        delivered_at = coalesce(delivered_at, now()),
        updated_at = now()
    where id = p_order_id and agent_id = p_agent_id;

  insert into public.agent_wallet_ledger (agent_id, order_id, amount, entry_type, note)
    values (p_agent_id, p_order_id, v_profit, 'sale_profit', 'Profit credited after successful delivery')
    on conflict (order_id) do nothing
    returning id into v_entry_id;

  if v_entry_id is not null then
    update public.agent_profiles
      set wallet_balance = wallet_balance + v_profit
      where user_id = p_agent_id;
  end if;
end;
$$;

revoke all on function public.activate_agent_membership(text) from public, anon, authenticated;
revoke all on function public.complete_agent_order(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_agent_membership(text) to service_role;
grant execute on function public.complete_agent_order(uuid, uuid, text, text) to service_role;
