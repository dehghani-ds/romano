-- Romano — core schema
-- Entities: zones, refrigerators, seats, profiles, products, orders,
--           order_items, payments, order_status_history

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'admin');
create type public.order_status as enum ('pending', 'in_progress', 'done', 'cancelled');
create type public.delivery_target as enum ('seat', 'refrigerator');
create type public.payment_method as enum ('receipt_upload', 'ipg', 'cash');
create type public.payment_status as enum ('awaiting_receipt', 'submitted', 'verified', 'rejected');

-- ---------------------------------------------------------------------------
-- Zones: a floor / wing / area of the workplace.
-- ---------------------------------------------------------------------------
create table public.zones (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  floor       integer,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.zones is 'Physical areas of the workplace; groups seats with their nearest refrigerator.';

-- ---------------------------------------------------------------------------
-- Refrigerators: drop-off points for orders not delivered to a seat.
-- ---------------------------------------------------------------------------
create table public.refrigerators (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references public.zones (id) on delete restrict,
  code        text not null unique,
  label       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index refrigerators_zone_id_idx on public.refrigerators (zone_id);

-- ---------------------------------------------------------------------------
-- Seats: where a person sits. Each seat knows its nearest refrigerator, which
-- is what makes "deliver to the nearest fridge" resolvable server-side.
-- ---------------------------------------------------------------------------
create table public.seats (
  id                      uuid primary key default gen_random_uuid(),
  zone_id                 uuid not null references public.zones (id) on delete restrict,
  code                    text not null unique,
  label                   text not null,
  nearest_refrigerator_id uuid references public.refrigerators (id) on delete set null,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);

create index seats_zone_id_idx on public.seats (zone_id);

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created by a trigger on auth.users.
--
-- Auth note: sign-up collects username + password (no email). The client maps
-- the username to a synthetic internal email so Supabase Auth can be used
-- as-is; the username remains the identity users actually type.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique
                check (username = lower(username) and username ~ '^[a-z0-9_]{3,30}$'),
  first_name  text not null check (length(btrim(first_name)) between 1 and 60),
  last_name   text not null check (length(btrim(last_name)) between 1 and 60),
  mobile      text not null unique check (mobile ~ '^\+?[0-9]{10,15}$'),
  seat_id     uuid references public.seats (id) on delete set null,
  role        public.user_role not null default 'customer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_seat_id_idx on public.profiles (seat_id);
create index profiles_role_idx on public.profiles (role);

comment on column public.profiles.username is 'Lowercase, unique. What the user types to sign in.';

-- ---------------------------------------------------------------------------
-- Products: Romano is the only active product for now; the table is ready for
-- latte, espresso, etc.
-- ---------------------------------------------------------------------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         text not null,
  description  text,
  price        numeric(12, 2) not null check (price >= 0),
  currency     text not null default 'IRR',
  image_url    text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders: always for a future day (tomorrow by default).
-- ---------------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           public.order_status not null default 'pending',
  delivery_date    date not null default (current_date + 1),
  delivery_target  public.delivery_target not null default 'seat',
  seat_id          uuid references public.seats (id) on delete set null,
  refrigerator_id  uuid references public.refrigerators (id) on delete set null,
  total_amount     numeric(12, 2) not null default 0 check (total_amount >= 0),
  currency         text not null default 'IRR',
  notes            text check (length(notes) <= 500),
  admin_note       text check (length(admin_note) <= 500),
  accepted_by      uuid references auth.users (id) on delete set null,
  accepted_at      timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- The delivery point must match the chosen target.
  constraint orders_delivery_point_ck check (
    (delivery_target = 'seat'         and seat_id is not null) or
    (delivery_target = 'refrigerator' and refrigerator_id is not null)
  )
);

create index orders_user_id_idx on public.orders (user_id);
create index orders_status_idx on public.orders (status);
create index orders_delivery_date_idx on public.orders (delivery_date desc);
create index orders_created_at_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------------------
-- Order items
-- ---------------------------------------------------------------------------
create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  quantity    integer not null check (quantity between 1 and 20),
  unit_price  numeric(12, 2) not null check (unit_price >= 0),
  line_total  numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz not null default now(),

  unique (order_id, product_id)
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Payments: one per order. Receipt upload is optional at checkout; the admin
-- reviews it before moving the order to in_progress.
-- ---------------------------------------------------------------------------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  amount         numeric(12, 2) not null check (amount >= 0),
  currency       text not null default 'IRR',
  method         public.payment_method not null default 'receipt_upload',
  status         public.payment_status not null default 'awaiting_receipt',
  receipt_path   text,           -- object path inside the private `receipts` bucket
  reference      text,           -- bank / IPG reference, for later
  paid_at        timestamptz,
  verified_by    uuid references auth.users (id) on delete set null,
  verified_at    timestamptz,
  reject_reason  text check (length(reject_reason) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A payment can only be 'submitted' once a receipt actually exists.
  constraint payments_receipt_required_ck check (
    status <> 'submitted' or receipt_path is not null
  )
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_status_idx on public.payments (status);

-- ---------------------------------------------------------------------------
-- Order status history: append-only audit trail.
-- ---------------------------------------------------------------------------
create table public.order_status_history (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid references auth.users (id) on delete set null,
  note         text check (length(note) <= 500),
  created_at   timestamptz not null default now()
);

create index order_status_history_order_id_idx on public.order_status_history (order_id, created_at desc);
