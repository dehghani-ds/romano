-- Romano — Persian interface, part 2 of 2
--
-- The Angular app now speaks Persian, but a good half of what a customer reads
-- is written here: RPCs raise messages straight onto the screen, and the seat
-- picker, delivery lines and product card render seeded labels verbatim.
-- Leaving these in English would put English sentences inside a Persian page.
--
-- Nothing structural changes: same signatures, same guards, same errcodes, same
-- natural keys. Only the human-readable text is translated.

-- ---------------------------------------------------------------------------
-- Status names in Persian, so a message can name a status the way the UI does.
-- ---------------------------------------------------------------------------
create or replace function public.status_label_fa(p_status public.order_status)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_status
    when 'pending'     then 'در انتظار'
    when 'in_progress' then 'در حال آماده‌سازی'
    when 'done'        then 'تحویل شده'
    when 'cancelled'   then 'لغو شده'
  end;
$$;

comment on function public.status_label_fa(public.order_status) is
  'Persian label for an order status, for messages raised to end users.';

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
      raise exception 'سفارش باید برای یک روز آینده ثبت شود (دست‌کم فردا).'
        using errcode = 'check_violation';
    end if;

    if new.order_number is null or new.order_number = '' then
      new.order_number := public.next_order_number();
    end if;
  end if;

  if new.delivery_target = 'seat' then
    new.refrigerator_id := null;
    if not exists (select 1 from public.seats s where s.id = new.seat_id and s.is_active) then
      raise exception 'میز انتخاب‌شده در دسترس نیست.' using errcode = 'check_violation';
    end if;
  else
    if not exists (
      select 1 from public.refrigerators r where r.id = new.refrigerator_id and r.is_active
    ) then
      raise exception 'یخچال انتخاب‌شده در دسترس نیست.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status machine: pending -> in_progress -> done, and pending/in_progress ->
-- cancelled. Nothing leaves a terminal state.
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
    raise exception 'سفارش را نمی‌توان از «%» به «%» برد.',
      public.status_label_fa(old.status), public.status_label_fa(new.status)
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

-- ---------------------------------------------------------------------------
-- place_order — prices the order server-side and resolves the delivery point.
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
    raise exception 'برای ثبت سفارش باید وارد حساب شوید.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'تعداد فنجان باید بین ۱ تا ۲۰ باشد.' using errcode = 'check_violation';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or not v_profile.is_active then
    raise exception 'حساب شما فعال نیست.' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id and is_active;
  if not found then
    raise exception 'این محصول در دسترس نیست.' using errcode = 'check_violation';
  end if;

  if v_profile.seat_id is null then
    raise exception 'پیش از سفارش، میز خود را در پروفایل مشخص کنید.'
      using errcode = 'check_violation';
  end if;

  v_seat_id := v_profile.seat_id;

  if p_delivery_target = 'refrigerator' then
    select s.nearest_refrigerator_id into v_fridge_id
    from public.seats s where s.id = v_seat_id;

    if v_fridge_id is null then
      raise exception 'هنوز یخچالی به میز شما وصل نشده است — تحویل سر میز را انتخاب کنید.'
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
    raise exception 'سفارش پیدا نشد.' using errcode = 'no_data_found';
  end if;

  if v_order.user_id <> v_uid and not public.is_admin(v_uid) then
    raise exception 'رسید را فقط می‌توانید به سفارش خودتان پیوست کنید.' using errcode = '42501';
  end if;

  if v_order.status in ('done', 'cancelled') then
    raise exception 'این سفارش هم‌اکنون «%» است.', public.status_label_fa(v_order.status)
      using errcode = 'check_violation';
  end if;

  if p_receipt_path is null or btrim(p_receipt_path) = '' then
    raise exception 'فایل رسید لازم است.' using errcode = 'check_violation';
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
    raise exception 'فقط مدیر می‌تواند وضعیت سفارش را تغییر دهد.' using errcode = '42501';
  end if;

  update public.orders
  set status     = p_status,
      admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note)
  where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'سفارش پیدا نشد.' using errcode = 'no_data_found';
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
-- review_payment — admin verifies or rejects a receipt.
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
    raise exception 'فقط مدیر می‌تواند رسید را بررسی کند.' using errcode = '42501';
  end if;

  if not p_approve and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'برای رد کردن رسید باید دلیل بنویسید.' using errcode = 'check_violation';
  end if;

  update public.payments
  set status        = case when p_approve then 'verified' else 'rejected' end,
      verified_by   = v_uid,
      verified_at   = now(),
      reject_reason = case when p_approve then null else btrim(p_reason) end
  where order_id = p_order_id
  returning * into v_payment;

  if not found then
    raise exception 'پرداخت پیدا نشد.' using errcode = 'no_data_found';
  end if;

  return v_payment;
end;
$$;

revoke all on function public.review_payment(uuid, boolean, text) from public;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_my_order — a customer withdraws an order that is still pending.
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
    raise exception 'سفارش پیدا نشد.' using errcode = 'no_data_found';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'فقط سفارشی که هنوز در انتظار است را می‌توانید خودتان لغو کنید.'
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
-- Reference data, translated. Codes are identifiers and stay Latin — only the
-- labels a person reads change.
-- ---------------------------------------------------------------------------
insert into public.zones (code, name, floor, sort_order) values
  ('F1-N', 'طبقهٔ ۱ — بال شمالی', 1, 10),
  ('F1-S', 'طبقهٔ ۱ — بال جنوبی', 1, 20),
  ('F2-N', 'طبقهٔ ۲ — بال شمالی', 2, 30),
  ('F2-S', 'طبقهٔ ۲ — بال جنوبی', 2, 40)
on conflict (code) do update
set name = excluded.name, floor = excluded.floor, sort_order = excluded.sort_order;

insert into public.refrigerators (zone_id, code, label, description)
select z.id, v.code, v.label, v.description
from (values
  ('F1-N', 'FR-101', 'یخچال ۱۰۱', 'آشپزخانهٔ کوچک شمالی طبقهٔ ۱، کنار آبسردکن'),
  ('F1-S', 'FR-102', 'یخچال ۱۰۲', 'لانج جنوبی طبقهٔ ۱، کنار میز قهوه'),
  ('F2-N', 'FR-201', 'یخچال ۲۰۱', 'آشپزخانهٔ کوچک شمالی طبقهٔ ۲'),
  ('F2-S', 'FR-202', 'یخچال ۲۰۲', 'اتاق استراحت جنوبی طبقهٔ ۲')
) as v(zone_code, code, label, description)
join public.zones z on z.code = v.zone_code
on conflict (code) do update
set label = excluded.label, description = excluded.description;

-- Seat labels follow the zone name; the desk number is written in Persian
-- digits, while the code (F1-N-01) stays Latin because people type it.
insert into public.seats (zone_id, code, label, nearest_refrigerator_id)
select
  z.id,
  z.code || '-' || lpad(n::text, 2, '0'),
  z.name || ' · میز ' || translate(lpad(n::text, 2, '0'), '0123456789', '۰۱۲۳۴۵۶۷۸۹'),
  r.id
from public.zones z
cross join generate_series(1, 12) as n
join public.refrigerators r on r.zone_id = z.id
on conflict (code) do update
set label = excluded.label, nearest_refrigerator_id = excluded.nearest_refrigerator_id;

insert into public.products (slug, name, description, price, currency, sort_order, is_active) values
  (
    'romano',
    'رومانو',
    'اسپرسوی کوتاه و روشن، با یک برش لیمو روی لبهٔ فنجان. هر فنجان صبح فردا تازه دم می‌شود.',
    45000,
    'IRR',
    10,
    true
  )
on conflict (slug) do update
set name        = excluded.name,
    description = excluded.description,
    price       = excluded.price,
    currency    = excluded.currency,
    is_active   = excluded.is_active;
