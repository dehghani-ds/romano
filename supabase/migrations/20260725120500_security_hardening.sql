-- Romano — security hardening
--
-- Addresses the Supabase database linter findings from the initial schema:
--   0011 function_search_path_mutable
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable
--
-- Supabase's default privileges grant EXECUTE on new functions in `public` to
-- anon/authenticated, so `revoke ... from public` is not enough — the roles
-- have to be named explicitly.

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on the two functions that were missing it.
-- ---------------------------------------------------------------------------
alter function public.touch_updated_at()  set search_path = public, pg_temp;
alter function public.next_order_number() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Trigger functions must not be reachable over PostgREST.
--
-- Firing a trigger does not check EXECUTE on the trigger function, so revoking
-- these does not affect the triggers themselves — it only removes the
-- /rest/v1/rpc/<name> surface.
-- ---------------------------------------------------------------------------
revoke execute on function public.touch_updated_at()                from public, anon, authenticated;
revoke execute on function public.next_order_number()               from public, anon, authenticated;
revoke execute on function public.handle_new_user()                 from public, anon, authenticated;
revoke execute on function public.validate_order()                  from public, anon, authenticated;
revoke execute on function public.enforce_order_status_transition() from public, anon, authenticated;
revoke execute on function public.log_order_status_change()         from public, anon, authenticated;
revoke execute on function public.recalculate_order_total()         from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Business RPCs are for signed-in users only — never anon.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_admin(uuid) from anon;
revoke execute on function public.place_order(uuid, integer, public.delivery_target, text, date) from anon;
revoke execute on function public.attach_receipt(uuid, text, text) from anon;
revoke execute on function public.set_order_status(uuid, public.order_status, text) from anon;
revoke execute on function public.review_payment(uuid, boolean, text) from anon;
revoke execute on function public.cancel_my_order(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 4. Drop username_exists.
--
-- Sign-in maps username -> synthetic email client-side and lets Supabase Auth
-- answer, so the probe was never needed — and an anon-callable existence check
-- is a free username-enumeration oracle.
-- ---------------------------------------------------------------------------
drop function if exists public.username_exists(text);

-- ---------------------------------------------------------------------------
-- 5. Anon-readable policies must not call is_admin().
--
-- The anon role no longer has EXECUTE on is_admin, and Postgres does not
-- guarantee short-circuiting of OR, so a policy of the form
-- `using (is_active or public.is_admin())` can raise "permission denied" for
-- anonymous visitors. Split the policies by role instead.
-- ---------------------------------------------------------------------------
drop policy "active seats are readable by everyone" on public.seats;
drop policy "active products are readable by everyone" on public.products;

create policy "anon reads active seats"
  on public.seats for select to anon
  using (is_active);

create policy "signed-in users read seats"
  on public.seats for select to authenticated
  using (is_active or public.is_admin());

create policy "anon reads active products"
  on public.products for select to anon
  using (is_active);

create policy "signed-in users read products"
  on public.products for select to authenticated
  using (is_active or public.is_admin());
