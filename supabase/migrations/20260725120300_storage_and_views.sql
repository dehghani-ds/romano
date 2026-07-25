-- Romano — receipts storage bucket + a denormalised order view

-- ---------------------------------------------------------------------------
-- Private bucket for payment receipts.
-- Path convention: <user_id>/<order_id>-<timestamp>.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
set file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public             = excluded.public;

create policy "users upload receipts into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read their own receipts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "users replace their own receipts"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own receipts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- order_details — everything the order list and the admin console need, in one
-- row. security_invoker means the underlying RLS on orders still applies, so a
-- customer sees only their own rows here.
-- ---------------------------------------------------------------------------
create view public.order_details
with (security_invoker = true)
as
select
  o.id,
  o.order_number,
  o.user_id,
  o.status,
  o.delivery_date,
  o.delivery_target,
  o.total_amount,
  o.currency,
  o.notes,
  o.admin_note,
  o.accepted_at,
  o.completed_at,
  o.cancelled_at,
  o.created_at,
  o.updated_at,

  cust.username        as customer_username,
  cust.first_name      as customer_first_name,
  cust.last_name       as customer_last_name,
  cust.mobile          as customer_mobile,

  seat.code            as seat_code,
  seat.label           as seat_label,
  fridge.code          as refrigerator_code,
  fridge.label         as refrigerator_label,
  zone.name            as zone_name,

  pay.id               as payment_id,
  pay.status           as payment_status,
  pay.method           as payment_method,
  pay.receipt_path     as receipt_path,
  pay.reference        as payment_reference,
  pay.reject_reason    as payment_reject_reason,
  pay.paid_at          as payment_paid_at,

  items.total_cups,
  items.product_names
from public.orders o
left join public.profiles cust        on cust.id = o.user_id
left join public.seats seat           on seat.id = o.seat_id
left join public.refrigerators fridge on fridge.id = o.refrigerator_id
left join public.zones zone           on zone.id = coalesce(seat.zone_id, fridge.zone_id)
left join public.payments pay         on pay.order_id = o.id
left join lateral (
  select
    coalesce(sum(oi.quantity), 0)              as total_cups,
    string_agg(p.name, ', ' order by p.name)   as product_names
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = o.id
) items on true;

grant select on public.order_details to authenticated;
