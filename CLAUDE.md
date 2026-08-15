# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Romano** — a workplace coffee ordering site. People order Romano coffee today
for delivery tomorrow, to their team. An admin accepts each order from a
separate dashboard, which moves it to *in progress*, then marks it *done* or
*cancelled*.

Ordering does not require an account. A visitor gives their name, mobile,
company and team, and gets back a guest token that keeps the order readable in
that browser; the order number plus the mobile finds it again from anywhere.
Signing up is optional and exists so that orders stay in one place — a guest
order can be claimed onto an account afterwards.

The catalog is not coffee-only. An order is a basket: several products, each
with its own quantity, in one order. Adding a latte or a cookie is a row in
`products` — an admin adds one from the dashboard, and it appears on the site
straight away. Each product carries its own `unit` (`فنجان`, `عدد`, `بسته`),
which is what the customer is counting and what every screen says.

## Stack

| Layer | Choice |
|-------|--------|
| Monorepo | Nx 23, pnpm workspaces, single root `package.json` |
| Front end | Angular 22, standalone components, **zoneless**, signals |
| Backend | NestJS 11, REST/JSON under `/api` |
| Database | PostgreSQL 17 via Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) |
| Language | Persian throughout — `<html lang="fa" dir="rtl">`, Vazirmatn, Jalali dates |
| Styling | Plain SCSS + CSS custom properties (no Tailwind, no component library) |
| Node | ≥ 22.22.3 |

## Layout

```
design-system/romano/MASTER.md   Source of truth for every visual decision
docker-compose.yml               Local Postgres
prisma.config.ts                 Prisma 7 CLI config (schema path, seed, DATABASE_URL)
apps/
  api/                           NestJS  — :3000
    prisma/schema.prisma         Models; migrations/ holds the SQL
    prisma/seed.ts               The product + an admin account
    src/generated/prisma/        Generated client (committed, compiled with the app)
    src/auth/                    Username + password, JWT, guards
    src/orders/                  OrdersService — the whole lifecycle lives here
    src/expenses/                ExpensesService — the admin expense ledger
    src/common/messages.ts       Every Persian sentence a user can see
  web/                           Angular — customer + guest, :4200
  dashboard/                     Angular — admin only, :4300
libs/shared/
  domain/                        Types, DTO shapes, format.ts (Jalali, Persian digits)
  ui/                            icon, status-chip, empty-state, spinner, toast, theme
  styles/                        _tokens.scss, _base.scss, _fonts.scss + Vazirmatn
```

## The rules that matter

### 1. Read the design system before touching UI

`design-system/romano/MASTER.md` is authoritative. Before building or changing
any screen, read it — and `design-system/romano/pages/<page>.md` if one exists,
which overrides the master for that page.

Non-negotiable:

- **No raw hex, px-radius, shadow or duration values in components.** Every value
  is a `var(--token)` from `_tokens.scss`. Verify with
  `grep -rEn "#[0-9a-fA-F]{6}\b" apps/*/src/app libs/shared/ui/src` — it must
  return nothing.
- **No emoji as icons.** All glyphs come from `libs/shared/ui/src/icon.ts`; add new
  ones to that map, matching the 24px grid and 1.75px stroke.
- **No physical direction in CSS.** The page is RTL: `margin-inline-start`, not
  `margin-left`; `inset-inline-end`, not `right`; `text-align: end`, not `right`.
  Verify with
  `grep -rEn "(margin|padding|border)-(left|right)|[^-](left|right):" apps/*/src libs/shared/*/src`.
- **Persian copy, Persian digits, Jalali dates.** Anything a person reads goes
  through `@romano/domain` (`fa-IR`); Latin digits survive only inside
  identifiers — order number, username, mobile — which need the `.code` class so
  bidi cannot reorder them.
- **Status is never colour alone** — always colour + icon + text.
- Light *and* dark must both be checked; dark is not inferred from light.
- Touch targets ≥44×44px, visible `:focus-visible`, `prefers-reduced-motion`
  honoured.

### 2. `OrdersService` owns the order lifecycle

There is no generic CRUD endpoint for `orders`, `order_items`, `payments` or
`order_status_history`, and there must never be one. Every write goes through
`apps/api/src/orders/orders.service.ts`, inside a transaction:

| Method | Who | Does |
|--------|-----|------|
| `place` | anyone | Prices every basket line from `products`, resolves the destination, creates order + items + payment + first history row |
| `attachReceipt` | owner, guest token holder, or admin | Stores the file, marks the payment `submitted` |
| `cancelOwn` | owner or guest token holder | Cancels, but only while `pending` |
| `adminSetStatus` | admin | Moves through the lifecycle, stamps timestamps, appends history |
| `adminReviewPayment` | admin | Verifies or rejects a receipt (rejection requires a reason) |
| `claim` | signed-in user | Moves a guest order onto their account |

Rules the service enforces, all previously Postgres triggers:

- Orders must be for a future **Tehran** day (default tomorrow), checked at
  creation only — an admin can still close out yesterday's order.
- Status machine: `pending → in_progress → done`, and `pending|in_progress →
  cancelled`. `done` and `cancelled` are terminal.
- `orders.totalAmount` and `payments.amount` are summed from each line's product
  price and quantity, never from the request. `priceBasket` is the pure function
  that does it, and `price-basket.spec.ts` covers the arithmetic and refusals.
- Every status change appends to `order_status_history`.
- Accepting an order auto-verifies a payment that is merely `submitted`.

**Under Supabase these guarantees came from row level security.** They now rest
on application code, so: if you add a business rule, put it in `OrdersService`,
and add a test. `apps/api/src/orders/orders.service.spec.ts` covers the
transition table and `canView`; keep it that way.

What *is* still in the database, in
`apps/api/prisma/migrations/*_integrity_constraints/`: unique indexes, foreign
keys, and CHECK constraints for the facts that must hold no matter which code
path wrote the row — including `orders_owner_ck`, which guarantees every order
has either a `user_id` or a `guest_token`.

### 2b. Expenses are a ledger, not an order

`apps/api/src/expenses/` records what Romano costs to run — beans, cups, a new
grinder. It touches nothing else: an expense is money going out, a payment is
money coming in, and the two are never netted against each other.

It is a *shared* book. Every admin reads every row and may correct or delete any
of them, because the alternative is several private lists. Three rules live in
`ExpensesService` and belong nowhere else:

- **The payer is chosen, not assumed.** `paidById` defaults to the signed-in
  admin, but one admin filing what a colleague paid is ordinary — and fixing the
  payer afterwards is an ordinary edit, unlike a product's slug.
- **The payer must be an active admin**, checked only when it is actually
  changing, so an admin who has since left does not freeze their old rows.
- **`spentAt` is never in the future**, in Tehran days. This is *not* a CHECK
  constraint on purpose: it is a judgement about today, and the database would
  re-evaluate it on every later UPDATE.

What is in the database, in `*_expense_integrity_constraints/`: `amount > 0`,
title and note lengths, and the currency shape.

Deleting is a real delete — nothing references `expenses`, so a row entered
twice leaves no hole when one goes. The confirmation that stops an accident is
in the dashboard, inline in the row.

### 3. Angular conventions

- Standalone components only — no NgModules.
- `signal()` for state, `computed()` for derived values. No `zone.js`.
- `ChangeDetectionStrategy.OnPush` on every component.
- Routes lazy-load via `loadComponent`.
- Services are `providedIn: 'root'`; HTTP goes through `provideHttpClient()` with
  `authInterceptor`, which attaches the bearer token and refreshes it once on 401.
- Shared code is imported as `@romano/domain` / `@romano/ui`, never by relative
  path across project boundaries.
- Errors reaching the user go through `toUserMessage()`, which is now a thin
  passthrough: the API already answers with a Persian, user-facing `message`. **A
  new user-facing message belongs in `apps/api/src/common/messages.ts`**, not in
  a translation table in the client.

### 4. Auth is username-based, and ordering is not gated

Sign-up collects username + password. There is no email column and no synthetic
email address — that mapping only ever existed to satisfy Supabase Auth, and it
is gone along with the DNS requirement and the unusable password reset. An admin
resets a password; adding a real, optional email column is the upgrade path.

Passwords are argon2. The API issues a short-lived access token and a long-lived
refresh token; both live in `localStorage` under `romano-auth` (`romano-admin-auth`
for the dashboard, so the two apps do not share a session).

Guests are identified by a 32-byte `guestToken` returned once at checkout. The
browser keeps it in `romano-guest-orders`; the client sends it as `X-Guest-Token`.
`GET /api/orders/:id` answers 404 — not 403 — for a wrong token, so an order id
is never a probe for whether an order exists.

## Working commands

```bash
pnpm db:up                    # Postgres in Docker
pnpm db:migrate                # apply migrations
pnpm db:seed                   # product + admin (ADMIN_USERNAME / ADMIN_PASSWORD)

pnpm exec nx serve api        # :3000
pnpm exec nx serve web        # :4200
pnpm exec nx serve dashboard  # :4300

pnpm exec nx run-many -t build # all three, must be warning-free
pnpm exec nx run-many -t test
```

Copy `.env.example` to `.env` first. Both Angular apps proxy `/api` to :3000 in
development, so no CORS is involved locally.

Database changes: edit `apps/api/prisma/schema.prisma`, then
`npx prisma migrate dev --name <what_changed>`. Constraints Prisma cannot express
go in a hand-written migration alongside it. `npx prisma generate` refreshes
`apps/api/src/generated/prisma`, which is committed and compiled with the app.

## Making someone an admin

New accounts are always `customer`. Promote by username:

```sql
update users set role = 'admin' where username = 'their_username';
```

## Deliberately not built yet

- Online payment (IPG). `payments.method` already has an `ipg` value and
  `payments.reference` is there for the gateway reference.
- Editing and removing products. Adding is built (`POST /api/admin/products`,
  محصول‌ها in the dashboard); changing a price, a unit or retiring a product is
  still a seed edit or a SQL statement.
- One currency per order. `priceBasket` refuses a basket that mixes them, which
  is free today because everything is IRR.
- Splitting an expense between admins, and anything that follows from it —
  who-owes-whom, settling up, per-payer balances. The ledger records one payer
  per row and stops there; the division is done outside the app.
- A Jalali date picker. `تاریخ خرج` is a native `<input type="date">`, so the
  picker itself is Gregorian; the field echoes the Jalali reading underneath it.
- Attaching a receipt image to an expense. `payments` has that machinery,
  `expenses` does not.
- Filtering or paging the expense ledger. It is one unpaginated list, because
  the page sums what it is given and a total over a partial page would be a lie.
- Push/SMS notification when an order is accepted, and OTP for guest checkout.
- Rate limiting is in-memory (`@nestjs/throttler` default store); a multi-instance
  deployment needs a shared one.
