# Romano ☕

Order a Romano today, drink it tomorrow.

A small ordering site for a workplace: people sign up with a username and their
seat, order however many cups of Romano they want for the next day, and pick
whether it arrives at their desk or in the refrigerator nearest to them. An
admin reviews each order — checking the payment receipt if one was uploaded —
and moves it through *in progress* to *done*.

---

## What is in the box

| | |
|---|---|
| **Front end** | Angular 22 · standalone · zoneless · signals · SCSS design tokens |
| **Back end** | Supabase — Postgres, Auth, Storage, row level security |
| **Design** | Generated with the [`ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill, recorded in `design-system/romano/MASTER.md` |

```
design-system/romano/MASTER.md   the design system every screen follows
supabase/migrations/             schema, RLS policies, business-rule RPCs
web/                             the Angular application
```

## Running it

Requires **Node ≥ 22.22.3** (Angular 22 will refuse to start on anything older).

```bash
cd web
npm install
npm start          # http://localhost:4200
```

The Supabase URL and publishable key are in `web/src/environments/`. The
publishable key is meant to be public — it only ever grants the `anon` role, and
every table is protected by row level security. The service-role key is never
used by this app and must not be added to it.

Production build:

```bash
npm run build      # output in web/dist/web
```

## First-time Supabase setup

The schema, policies and seed data are already applied to the project. Two
things need doing by hand once:

1. **Turn off email confirmation.** Authentication → Sign In / Providers →
   Email → disable *Confirm email*. Accounts are identified by username and the
   internal address (`<username>@romano.app`) receives no mail, so a
   confirmation link would never arrive.

   The domain in `usernameEmailDomain` (see `web/src/environments/`) **must be
   one you own that resolves in DNS** — Supabase Auth looks it up and rejects
   sign-up with `email_address_invalid` otherwise. It never needs to accept
   mail; it only has to exist.

2. **Create your first admin.** Sign up through the site normally, then run:

   ```sql
   update public.profiles set role = 'admin' where username = 'your_username';
   ```

   Sign out and back in, and the **Admin** tab appears.

## How it works

### Ordering

1. A signed-in user opens **Order**, picks 1–20 cups, and chooses **my seat** or
   **nearest refrigerator**. The fridge is derived from the seat — every seat is
   mapped to the closest one.
2. They may attach a payment receipt (image or PDF, ≤5 MB). This is optional;
   it can also be added later from the order page.
3. The order is created as **pending** for tomorrow's date.

### Admin

The **Admin** console lists every order with filters for status, delivery day
and a search across order number, username, name and mobile. From there:

- **Accept** — pending → in progress. A submitted receipt is marked verified at
  the same time.
- **Mark done** — in progress → done.
- **Cancel** — from pending or in progress, with an optional reason shown to the
  customer.

Receipts open through short-lived signed URLs; the storage bucket is private.

### Data model

| Table | Purpose |
|-------|---------|
| `zones` | Floors / wings of the building |
| `refrigerators` | Drop-off fridges, one or more per zone |
| `seats` | Desks, each mapped to its nearest refrigerator |
| `profiles` | One per user: username, name, family name, mobile, seat, role |
| `products` | What is for sale (Romano today; latte and espresso later) |
| `orders` | Status, delivery date, delivery target, totals |
| `order_items` | Line items — product, quantity, unit price |
| `payments` | One per order: amount, method, receipt path, verification state |
| `order_status_history` | Append-only audit trail of every status change |

`order_details` is a view joining all of it into one row per order, and it
respects row level security — a customer selecting from it sees only their own
orders.

## Security model

- Row level security is on for every table. Customers see only their own orders,
  items, payments and history; admins see everything.
- Customers have **no** insert or update policy on `orders`, `order_items` or
  `payments`. All writes go through `SECURITY DEFINER` functions that authorize
  the caller themselves, so prices, the delivery point, the status machine and
  the audit trail cannot be forged from the browser.
- The order lifecycle is enforced by a trigger — illegal transitions such as
  `done → in_progress` are rejected by the database, not just hidden in the UI.
- Receipts live in a private bucket under `<user-id>/…`; storage policies stop
  anyone writing to or reading another user's folder.
- Users cannot promote themselves: the profile update policy pins `role` and
  `is_active` to their current values.

These were verified against the live database by impersonating each role the way
PostgREST does — 27 checks covering tenant isolation, privilege boundaries,
quantity and date guards, and the full status machine.

## Adding a second product

```sql
insert into public.products (slug, name, description, price, currency, sort_order)
values ('latte', 'Latte', 'Espresso with steamed milk.', 60000, 'IRR', 20);
```

The ordering screen currently shows a single featured product; turning it into a
picker is a UI change only.

## Not built yet

- Online payment (IPG). `payments.method` already accepts `ipg` and
  `payments.reference` is ready for a gateway reference.
- Admin screens for managing seats, fridges and products (seeded by migration
  for now).
- Notifying a customer when their order is accepted.
