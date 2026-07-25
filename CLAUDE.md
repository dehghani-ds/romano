# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Romano** — a workplace coffee ordering site. People order Romano coffee today
for delivery tomorrow, either to their seat or to the refrigerator nearest to
their seat. An admin accepts each order, which moves it to *in progress*, then
marks it *done* or *cancelled*.

Romano is the only product on sale today. The schema is already multi-product:
adding latte or espresso is a row in `products`, not a migration.

## Stack

| Layer | Choice |
|-------|--------|
| Front end | Angular 22, standalone components, **zoneless**, signals |
| Language | Persian throughout — `<html lang="fa" dir="rtl">`, Vazirmatn, Jalali dates |
| Styling | Plain SCSS + CSS custom properties (no Tailwind, no component library) |
| Backend / DB / auth / storage | Supabase (project `mhyizhxbsujhlaahnrjc`, region ap-south-1) |
| Node | ≥ 22.22.3 (Angular 22 requires it) |

## Layout

```
design-system/romano/MASTER.md   Source of truth for every visual decision
supabase/migrations/*.sql        Schema, RLS, RPCs — applied in filename order
web/                             Angular application
  src/styles/_tokens.scss        Design tokens as CSS variables
  src/styles/_base.scss          Reset + shared primitives (.btn, .card, .field…)
  src/app/core/                  Services, models, guards, formatting
  src/app/shared/                Presentational primitives (icon, chip, toast…)
  src/app/features/<feature>/    One folder per route
  src/app/layout/                App shell
```

## The rules that matter

### 1. Read the design system before touching UI

`design-system/romano/MASTER.md` is authoritative. Before building or changing
any screen, read it — and `design-system/romano/pages/<page>.md` if one exists,
which overrides the master for that page.

Non-negotiable:

- **No raw hex, px-radius, shadow or duration values in components.** Every value
  is a `var(--token)` from `_tokens.scss`. Verify with
  `grep -rEn "#[0-9a-fA-F]{6}\b" web/src/app/` — it must return nothing.
- **No emoji as icons.** All glyphs come from `shared/icon.ts`; add new ones to
  that map, matching the 24px grid and 1.75px stroke.
- **No physical direction in CSS.** The page is RTL: `margin-inline-start`, not
  `margin-left`; `inset-inline-end`, not `right`; `text-align: end`, not `right`.
  Verify with
  `grep -rEn "(margin|padding|border)-(left|right)|[^-](left|right):" web/src/app web/src/styles`.
- **Persian copy, Persian digits, Jalali dates.** Anything a person reads goes
  through `core/format.ts` (`fa-IR`); Latin digits survive only inside
  identifiers — order number, username, mobile — which need the `.code` class so
  bidi cannot reorder them.
- **Status is never colour alone** — always colour + icon + text.
- Light *and* dark must both be checked; dark is not inferred from light.
- Touch targets ≥44×44px, visible `:focus-visible`, `prefers-reduced-motion`
  honoured.

### 2. The database owns the business rules

The client never writes to `orders`, `order_items` or `payments`. There are no
INSERT/UPDATE policies for customers on those tables — writes go exclusively
through `SECURITY DEFINER` RPCs:

| RPC | Who | Does |
|-----|-----|------|
| `place_order` | customer | Prices the order server-side, resolves the seat/fridge, creates order + item + payment |
| `attach_receipt` | owner or admin | Stores the receipt path, marks the payment `submitted` |
| `cancel_my_order` | owner | Cancels, but only while `pending` |
| `set_order_status` | admin | Moves through the lifecycle; verifies a submitted receipt on accept |
| `review_payment` | admin | Verifies or rejects a receipt (rejection requires a reason) |

Enforced by triggers, not by the UI:

- Orders must be for a future day (default tomorrow).
- Status machine: `pending → in_progress → done`, and `pending|in_progress →
  cancelled`. Terminal states are terminal.
- `orders.total_amount` is recomputed from `order_items` on every change.
- Every status change is appended to `order_status_history`.

**If you add a business rule, put it in the database**, then surface it in the
UI. A rule that lives only in Angular is not enforced.

### 3. Angular conventions

- Standalone components only — no NgModules.
- `signal()` for state, `computed()` for derived values. No `zone.js`.
- `ChangeDetectionStrategy.OnPush` on every component.
- Routes lazy-load via `loadComponent`.
- Services are `providedIn: 'root'`; the Supabase client comes from the
  `SUPABASE` injection token, never `createClient` at a call site.
- Errors reaching the user go through `toUserMessage()`, which turns constraint
  names into Persian sentences. RPC messages are already written for end users,
  in Persian — a new user-facing message belongs in a migration, not a
  translation table in the client.

### 4. Auth is username-based

There is no email field. Sign-up collects username + password; the client maps
the username to `<username>@<usernameEmailDomain>` (see
`web/src/environments/`) so Supabase Auth works unchanged.

Two constraints on that domain, both learned the hard way:

1. **It must resolve in DNS.** Supabase Auth looks the domain up and rejects
   sign-up with `email_address_invalid` if it does not exist. An invented
   domain such as `users.romano.app` fails outright. It does not need to accept
   mail — it only has to have a record.
2. **"Confirm email" must stay off** in the Supabase project, because nothing
   ever reads a mailbox there. `AuthService.signUp` throws an explicit message
   if it is switched back on.

Consequence: there is no email password reset. An admin resets a password from
the Supabase dashboard. Adding a real optional email column is the upgrade path.

**Testing note:** inserting into `auth.users` with SQL bypasses GoTrue
completely, including this validation. Sign-up is only genuinely tested by
calling `auth.signUp()` over HTTP.

## Working commands

```bash
cd web
npm start                 # dev server on :4200
npm run build             # production build (must be warning-free)
npx ng build --configuration development
```

Database changes: write a new timestamped file in `supabase/migrations/`, then
apply it with the Supabase MCP `apply_migration` tool. Always run
`get_advisors` with `type: "security"` afterwards and resolve what it reports.

Regenerate types after a schema change:
`supabase gen types typescript --project-id mhyizhxbsujhlaahnrjc`
(hand-maintained equivalents live in `web/src/app/core/models.ts`).

## Making someone an admin

New accounts are always `customer`. Promote by username:

```sql
update public.profiles set role = 'admin' where username = 'their_username';
```

## Testing notes

The Supabase REST host is blocked from some sandboxes by egress policy. When it
is, verify backend behaviour with SQL through the MCP `execute_sql` tool,
impersonating a user exactly as PostgREST does:

```sql
perform set_config('role', 'authenticated', true);
perform set_config('request.jwt.claims',
  json_build_object('sub', '<user-uuid>', 'role', 'authenticated')::text, true);
```

This exercises the real RLS policies and RPC authorization.

## Deliberately not built yet

- Online payment (IPG). `payments.method` already has an `ipg` value and
  `payments.reference` is there for the gateway reference.
- Products beyond Romano — the schema supports them; the UI shows one product.
- Admin CRUD for seats, fridges and products (currently seeded by migration).
- Push/SMS notification when an order is accepted.
