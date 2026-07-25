-- Romano — reference data
--
-- Zones, refrigerators, seats and the single product we sell today.
-- Re-runnable: every insert is keyed on a natural code.

-- Zones ---------------------------------------------------------------------
insert into public.zones (code, name, floor, sort_order) values
  ('F1-N', 'Floor 1 — North wing', 1, 10),
  ('F1-S', 'Floor 1 — South wing', 1, 20),
  ('F2-N', 'Floor 2 — North wing', 2, 30),
  ('F2-S', 'Floor 2 — South wing', 2, 40)
on conflict (code) do update
set name = excluded.name, floor = excluded.floor, sort_order = excluded.sort_order;

-- Refrigerators -------------------------------------------------------------
insert into public.refrigerators (zone_id, code, label, description)
select z.id, v.code, v.label, v.description
from (values
  ('F1-N', 'FR-101', 'Fridge 101', 'Floor 1 north kitchenette, next to the water cooler'),
  ('F1-S', 'FR-102', 'Fridge 102', 'Floor 1 south lounge, beside the coffee corner'),
  ('F2-N', 'FR-201', 'Fridge 201', 'Floor 2 north kitchenette'),
  ('F2-S', 'FR-202', 'Fridge 202', 'Floor 2 south break room')
) as v(zone_code, code, label, description)
join public.zones z on z.code = v.zone_code
on conflict (code) do update
set label = excluded.label, description = excluded.description;

-- Seats ---------------------------------------------------------------------
-- 12 seats per zone: <zone>-01 .. <zone>-12, each mapped to its zone fridge.
insert into public.seats (zone_id, code, label, nearest_refrigerator_id)
select
  z.id,
  z.code || '-' || lpad(n::text, 2, '0'),
  z.name || ' · Desk ' || lpad(n::text, 2, '0'),
  r.id
from public.zones z
cross join generate_series(1, 12) as n
join public.refrigerators r on r.zone_id = z.id
on conflict (code) do update
set label = excluded.label, nearest_refrigerator_id = excluded.nearest_refrigerator_id;

-- Products ------------------------------------------------------------------
-- Romano is the only thing on sale for now. Latte / espresso rows can be added
-- later with is_active = true and no schema change.
insert into public.products (slug, name, description, price, currency, sort_order, is_active) values
  (
    'romano',
    'Romano',
    'A short, bright espresso served with a twist of lemon on the rim. One cup, made fresh for tomorrow morning.',
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
