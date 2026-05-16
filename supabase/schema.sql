-- Supabase schema for Final Heaven

create extension if not exists "pgcrypto";

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  email text not null,
  status text not null default 'ordered',
  tracking_number text not null unique,
  shipping_address text not null,
  shipping_city text,
  shipping_state text,
  shipping_postal_code text,
  shipping_country text,
  subtotal numeric(10,2) not null,
  total numeric(10,2) not null,
  order_items jsonb not null,
  timeline jsonb not null default jsonb_build_array(
    jsonb_build_object(
      'status', 'ordered',
      'date', to_char(now(), 'YYYY-MM-DD'),
      'time', to_char(now(), 'HH24:MI'),
      'description', 'Order placed'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_email on orders(email);

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  subscribed_at timestamptz not null default now()
);

-- Products table
create table if not exists products (
  id text primary key,
  name text not null,
  description text,
  price numeric(10,2) not null,
  original_price numeric(10,2),
  category text not null,
  images jsonb default '[]',
  stock integer not null default 0,
  status text not null default 'active',
  is_new boolean default false,
  is_limited boolean default false,
  is_trending boolean default false,
  members_only boolean default false,
  release_date date,
  rating numeric(3,1),
  reviews integer default 0,
  sales integer default 0,
  colors jsonb default '[]',
  sizes jsonb default '[]',
  tags jsonb default '[]',
  card_size text default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category on products(category);
create index if not exists idx_products_status on products(status);

-- Drops table
create table if not exists drops (
  id text primary key,
  name text not null,
  description text,
  release_date date not null,
  release_time time not null,
  status text not null default 'draft',
  preview_image text,
  members_only boolean default false,
  early_access_hours integer default 24,
  products jsonb default '[]',
  tags jsonb default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drops_status on drops(status);
create index if not exists idx_drops_release_date on drops(release_date);

