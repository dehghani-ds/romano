# Romano ☕

Order a Romano today, drink it tomorrow.

A small ordering site for a workplace. Someone says how many cups of Romano they
want for tomorrow, who they are, and which team to bring them to — no account
needed. An admin reviews each order in a separate dashboard, checking the payment
receipt if one was uploaded, and moves it through *in progress* to *done*.

Signing up is optional. It exists so that orders stay in one place across
browsers and devices, and an order placed as a guest can be claimed onto an
account afterwards.

---

## What is in the box

| | |
|---|---|
| **Monorepo** | Nx 23 · npm workspaces · one root `package.json` |
| **Front end** | Angular 22 · standalone · zoneless · signals · SCSS design tokens |
| **Back end** | NestJS 11 · REST/JSON · JWT + argon2 |
| **Database** | PostgreSQL 17 · Prisma 7 |
| **Language** | Persian (`fa`), right-to-left, Vazirmatn, Jalali dates, Persian digits |
| **Design** | Generated with the [`ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill, recorded in `design-system/romano/MASTER.md` |

```
design-system/romano/MASTER.md   the design system every screen follows
apps/api/                        NestJS + Prisma          → :3000
apps/web/                        the customer site        → :4200
apps/dashboard/                  the admin console        → :4300
libs/shared/domain/              types, DTOs, Jalali + Persian-digit formatting
libs/shared/ui/                  icons, chips, toasts, theme — shared by both apps
libs/shared/styles/              design tokens, base styles, the Vazirmatn font
```

## Running it

Requires **Node ≥ 22.22.3** and Docker (for Postgres).

```bash
cp .env.example .env
npm install
npm run db:up          # Postgres 17 in Docker
npm run db:migrate     # apply migrations
npm run db:seed        # the Romano product + an admin account
```

Then, in three terminals:

```bash
npx nx serve api        # http://localhost:3000/api
npx nx serve web        # http://localhost:4200
npx nx serve dashboard  # http://localhost:4300
```

Both Angular apps proxy `/api` to the API in development, so there is no CORS to
configure locally.

The seeded admin uses `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`. **Change
the password before this runs anywhere real** — the example value is a
placeholder, and re-seeding never overwrites a password you have already changed.

Production build:

```bash
npx nx run-many -t build     # output in dist/apps/{api,web,dashboard}
```

## How it works

### Ordering

1. Anyone opens **سفارش**, picks 1–20 cups, and gives their name, mobile,
   company (defaulting to دیجی‌پی) and team. A signed-in customer gets those
   fields filled in from their profile and can still change them — ordering for
   another team should not mean editing your profile.
2. They may attach a payment receipt (image or PDF, ≤5 MB). Optional; it can be
   added later from the order page.
3. The order is created as **pending** for tomorrow's date in Tehran.

A guest gets back a token, stored in their browser, that keeps the order
readable. If that is lost, **پیگیری** finds the order again from its number plus
the mobile it was placed with.

### Admin

The dashboard is a separate app on its own origin, and only an admin can sign in.
It opens on a summary — cups to prepare tomorrow, counts per status, receipts
waiting for review — and the order list supports filtering and paging on the
server. From there:

- **تأیید** — pending → in progress. A submitted receipt is verified at the same
  time.
- **تحویل شد** — in progress → done.
- **لغو** — from pending or in progress, with a reason shown to the customer.
- **تأیید / رد رسید** — review a receipt on its own; rejecting requires a reason.

Receipts are streamed through an authenticated endpoint. The storage key never
reaches the browser.

### Data model

| Table | Purpose |
|-------|---------|
| `users` | Username, argon2 password, name, mobile, company, team, role |
| `products` | What is for sale (Romano today; latte and espresso later) |
| `orders` | Status, delivery date, contact and destination snapshot, totals |
| `order_items` | Line items — product, quantity, unit price |
| `payments` | One per order: amount, method, receipt path, verification state |
| `order_status_history` | Append-only audit trail of every status change |

An order belongs either to a `users` row or to a guest holding a `guest_token`.
Contact name, mobile, company and team are copied onto the order at checkout, so
editing a profile later never rewrites the history of an old order.

## Security model

- **Writes to orders and payments have exactly one entry point**, `OrdersService`.
  There is no generic CRUD endpoint for those tables, so prices, the delivery
  day, the status machine and the audit trail cannot be forged from a browser.
- The order lifecycle is a real state machine: `done → in_progress` is rejected
  by the server, not merely hidden in the UI.
- Reads are scoped by owner: a signed-in customer sees their own orders, a guest
  sees only what their token unlocks, an admin sees everything. A wrong or
  missing token answers **404, not 403** — an order id is never a way to find out
  whether an order exists.
- Guest tokens are 32 random bytes and compared in constant time.
- Customers cannot promote themselves: `role` and `isActive` are not reachable
  from the profile-update path at all.
- Integrity that must hold regardless of code path — including "every order has
  an owner" — is enforced by CHECK constraints in the database.

Rate limiting is in-memory today; running more than one API instance needs a
shared store.

## Adding a second product

```sql
insert into products (id, slug, name, description, price, currency, sort_order, updated_at)
values (gen_random_uuid(), 'latte', 'لاته', 'اسپرسو با شیر بخارپز.', 60000, 'IRR', 20, now());
```

The ordering screen shows a single featured product; turning it into a picker is
a UI change only.

## Not built yet

- Online payment (IPG). `payments.method` already accepts `ipg` and
  `payments.reference` is ready for a gateway reference.
- Admin screens for managing products (seeded for now).
- Notifying a customer when their order is accepted, and OTP for guest checkout.
