-- Romano — row level security
--
-- Shape of the rules:
--   * Reference data (zones, refrigerators, seats, products) is readable by any
--     signed-in user, and by anon for seats/zones so the sign-up form can offer
--     a seat picker. Writes are admin-only.
--   * A customer sees only their own orders, items, payments and history.
--   * Admins see everything.
--   * Orders/payments are never written directly by the client — the RPCs in
--     20260725120100 own those writes. No INSERT/UPDATE policy is granted to
--     customers on those tables.

alter table public.zones                enable row level security;
alter table public.refrigerators        enable row level security;
alter table public.seats                enable row level security;
alter table public.profiles             enable row level security;
alter table public.products             enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.payments             enable row level security;
alter table public.order_status_history enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create policy "zones are readable by everyone"
  on public.zones for select
  to anon, authenticated
  using (true);

create policy "admins manage zones"
  on public.zones for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "active seats are readable by everyone"
  on public.seats for select
  to anon, authenticated
  using (is_active or public.is_admin());

create policy "admins manage seats"
  on public.seats for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "active refrigerators are readable by signed-in users"
  on public.refrigerators for select
  to authenticated
  using (is_active or public.is_admin());

create policy "admins manage refrigerators"
  on public.refrigerators for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "active products are readable by everyone"
  on public.products for select
  to anon, authenticated
  using (is_active or public.is_admin());

create policy "admins manage products"
  on public.products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "users read their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- A user may edit their own details, but not promote themselves to admin or
-- reactivate a disabled account.
create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
  );

create policy "admins update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Orders — read-only for customers; all writes go through the RPCs.
-- ---------------------------------------------------------------------------
create policy "users read their own orders"
  on public.orders for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "admins update orders"
  on public.orders for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Order items
-- ---------------------------------------------------------------------------
create policy "users read their own order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create policy "users read their own payments"
  on public.payments for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "admins update payments"
  on public.payments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Status history — append-only, written by the trigger.
-- ---------------------------------------------------------------------------
create policy "users read the history of their own orders"
  on public.order_status_history for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())
    )
  );
