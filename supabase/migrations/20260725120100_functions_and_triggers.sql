-- Romano — helper functions, business rules, triggers and RPCs

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so RLS policies can call them without
-- recursing back into the profiles policies.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin' and p.is_active
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sign-up: create the profile from the metadata passed to auth.signUp().
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seat_id uuid;
begin
  begin
    v_seat_id := nullif(new.raw_user_meta_data ->> 'seat_id', '')::uuid;
  exception when invalid_text_representation then
    v_seat_id := null;
  end;

  insert into public.profiles (id, username, first_name, last_name, mobile, seat_id)
  values (
    new.id,
    lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', ''))),
    btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')),
    btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')),
    btrim(coalesce(new.raw_user_meta_data ->> 'mobile', '')),
    v_seat_id
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Order numbers: RM-YYMMDD-0001
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq;

create or replace function public.next_order_number()
returns text
language sql
volatile
as $$
  select 'RM-' || to_char(now(), 'YYMMDD') || '-' ||
         lpad((nextval('public.order_number_seq') % 10000)::text, 4, '0');
$$;

-- ---------------------------------------------------------------------------
-- Orders must be for a future day, and the delivery point has to be real.
-- ---------------------------------------------------------------------------
create or replace function public.validate_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.delivery_date <= current_date then
      raise exception 'Orders must be placed for a future day (tomorrow at the earliest).'
        using errcode = 'check_violation';
    end if;

    if new.order_number is null or new.order_number = '' then
      new.order_number := public.next_order_number();
    end if;
  end if;

  if new.delivery_target = 'seat' then
    new.refrigerator_id := null;
    if not exists (select 1 from public.seats s where s.id = new.seat_id and s.is_active) then
      raise exception 'The selected seat is not available.' using errcode = 'check_violation';
    end if;
  else
    if not exists (
      select 1 from public.refrigerators r where r.id = new.refrigerator_id and r.is_active
    ) then
      raise exception 'The selected refrigerator is not available.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_validate
  before insert or update on public.orders
  for each row execute function public.validate_order();

-- ---------------------------------------------------------------------------
-- Status machine: pending -> in_progress -> done, and pending/in_progress ->
-- cancelled. Nothing leaves a terminal state. Timestamps are stamped here so
-- they cannot drift from the status.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending'     and new.status in ('in_progress', 'cancelled')) or
    (old.status = 'in_progress' and new.status in ('done', 'cancelled'))
  ) then
    raise exception 'Cannot move an order from % to %.', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'in_progress' then
    new.accepted_by := coalesce(new.accepted_by, auth.uid());
    new.accepted_at := coalesce(new.accepted_at, now());
  elsif new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

create trigger orders_enforce_status_transition
  before update on public.orders
  for each row execute function public.enforce_order_status_transition();

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(), new.admin_note);
  end if;

  return null;
end;
$$;

create trigger orders_log_status_change
  after insert or update on public.orders
  for each row execute function public.log_order_status_change();

-- ---------------------------------------------------------------------------
-- Order totals are derived from the items, never taken from the client.
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_order_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_total    numeric(12, 2);
begin
  select coalesce(sum(line_total), 0) into v_total
  from public.order_items
  where order_id = v_order_id;

  update public.orders set total_amount = v_total where id = v_order_id;
  update public.payments set amount = v_total where order_id = v_order_id;

  return null;
end;
$$;

create trigger order_items_recalculate_total
  after insert or update or delete on public.order_items
  for each row execute function public.recalculate_order_total();

-- ---------------------------------------------------------------------------
-- place_order — the only supported way to create an order.
--
-- Runs as SECURITY DEFINER so prices, totals and the "nearest refrigerator"
-- lookup are all resolved server-side; the client only says what it wants and
-- how many.
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_product_id       uuid,
  p_quantity         integer,
  p_delivery_target  public.delivery_target default 'seat',
  p_notes            text default null,
  p_delivery_date    date default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles;
  v_product    public.products;
  v_seat_id    uuid;
  v_fridge_id  uuid;
  v_date       date := coalesce(p_delivery_date, current_date + 1);
  v_order      public.orders;
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Choose between 1 and 20 cups.' using errcode = 'check_violation';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or not v_profile.is_active then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id and is_active;
  if not found then
    raise exception 'That product is not available.' using errcode = 'check_violation';
  end if;

  if v_profile.seat_id is null then
    raise exception 'Set your seat in your profile before ordering.' using errcode = 'check_violation';
  end if;

  v_seat_id := v_profile.seat_id;

  if p_delivery_target = 'refrigerator' then
    select s.nearest_refrigerator_id into v_fridge_id
    from public.seats s where s.id = v_seat_id;

    if v_fridge_id is null then
      raise exception 'No refrigerator is mapped to your seat yet — choose seat delivery.'
        using errcode = 'check_violation';
    end if;

    v_seat_id := null;
  end if;

  insert into public.orders (
    user_id, delivery_date, delivery_target, seat_id, refrigerator_id, notes, currency
  )
  values (
    v_uid, v_date, p_delivery_target, v_seat_id, v_fridge_id,
    nullif(btrim(coalesce(p_notes, '')), ''), v_product.currency
  )
  returning * into v_order;

  insert into public.order_items (order_id, product_id, quantity, unit_price)
  values (v_order.id, v_product.id, p_quantity, v_product.price);

  insert into public.payments (order_id, user_id, amount, currency, method, status)
  values (
    v_order.id, v_uid, p_quantity * v_product.price, v_product.currency,
    'receipt_upload', 'awaiting_receipt'
  );

  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end;
$$;

revoke all on function public.place_order(uuid, integer, public.delivery_target, text, date) from public;
grant execute on function public.place_order(uuid, integer, public.delivery_target, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- attach_receipt — customer attaches (or replaces) a payment receipt.
-- Allowed while the order has not been completed or cancelled.
-- ---------------------------------------------------------------------------
create or replace function public.attach_receipt(
  p_order_id     uuid,
  p_receipt_path text,
  p_reference    text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_order   public.orders;
  v_payment public.payments;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  if v_order.user_id <> v_uid and not public.is_admin(v_uid) then
    raise exception 'You can only attach a receipt to your own order.' using errcode = '42501';
  end if;

  if v_order.status in ('done', 'cancelled') then
    raise exception 'This order is already %.', v_order.status using errcode = 'check_violation';
  end if;

  if p_receipt_path is null or btrim(p_receipt_path) = '' then
    raise exception 'A receipt file is required.' using errcode = 'check_violation';
  end if;

  update public.payments
  set receipt_path  = p_receipt_path,
      reference     = nullif(btrim(coalesce(p_reference, '')), ''),
      status        = 'submitted',
      paid_at       = coalesce(paid_at, now()),
      reject_reason = null,
      verified_by   = null,
      verified_at   = null
  where order_id = p_order_id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.attach_receipt(uuid, text, text) from public;
grant execute on function public.attach_receipt(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_order_status — admin moves an order through the lifecycle.
-- Accepting an order (-> in_progress) marks a submitted receipt as verified.
-- ---------------------------------------------------------------------------
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_note     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only an admin can change an order status.' using errcode = '42501';
  end if;

  update public.orders
  set status     = p_status,
      admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note)
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  if p_status = 'in_progress' then
    update public.payments
    set status      = 'verified',
        verified_by = v_uid,
        verified_at = now()
    where order_id = p_order_id and status = 'submitted';
  end if;

  return v_order;
end;
$$;

revoke all on function public.set_order_status(uuid, public.order_status, text) from public;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- review_payment — admin verifies or rejects a receipt independently of the
-- order status.
-- ---------------------------------------------------------------------------
create or replace function public.review_payment(
  p_order_id uuid,
  p_approve  boolean,
  p_reason   text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_payment public.payments;
begin
  if not public.is_admin(v_uid) then
    raise exception 'Only an admin can review a payment.' using errcode = '42501';
  end if;

  if not p_approve and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Give a reason when rejecting a receipt.' using errcode = 'check_violation';
  end if;

  update public.payments
  set status        = case when p_approve then 'verified' else 'rejected' end,
      verified_by   = v_uid,
      verified_at   = now(),
      reject_reason = case when p_approve then null else btrim(p_reason) end
  where order_id = p_order_id
  returning * into v_payment;

  if not found then
    raise exception 'Payment not found.' using errcode = 'no_data_found';
  end if;

  return v_payment;
end;
$$;

revoke all on function public.review_payment(uuid, boolean, text) from public;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_my_order — a customer may withdraw an order that has not been
-- accepted yet.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.user_id <> v_uid then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Only an order that is still pending can be cancelled by you.'
      using errcode = 'check_violation';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.cancel_my_order(uuid) from public;
grant execute on function public.cancel_my_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- username_to_email — lets the sign-in screen resolve a username without
-- exposing the profiles table to anonymous users.
-- ---------------------------------------------------------------------------
create or replace function public.username_exists(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where username = lower(btrim(p_username))
  );
$$;

revoke all on function public.username_exists(text) from public;
grant execute on function public.username_exists(text) to anon, authenticated;
