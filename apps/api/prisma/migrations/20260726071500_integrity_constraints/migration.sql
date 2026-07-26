-- Integrity rules that Prisma's schema language cannot express.
--
-- The order lifecycle, pricing and authorization live in OrdersService — that is
-- a deliberate choice, not an oversight. What stays here is the narrower set of
-- facts that must be true of a row no matter which code path wrote it, so that a
-- bug in the service layer cannot leave the database holding nonsense.

-- users ----------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_ck"
    CHECK ("username" = lower("username") AND "username" ~ '^[a-z0-9_]{3,30}$'),
  ADD CONSTRAINT "users_mobile_ck"
    CHECK ("mobile" ~ '^\+?[0-9]{10,15}$'),
  ADD CONSTRAINT "users_first_name_ck"
    CHECK (length(btrim("first_name")) BETWEEN 1 AND 60),
  ADD CONSTRAINT "users_last_name_ck"
    CHECK (length(btrim("last_name")) BETWEEN 1 AND 60),
  ADD CONSTRAINT "users_company_name_ck"
    CHECK (length(btrim("company_name")) BETWEEN 1 AND 80),
  ADD CONSTRAINT "users_team_name_ck"
    CHECK (length(btrim("team_name")) BETWEEN 1 AND 80);

-- products -------------------------------------------------------------------
ALTER TABLE "products"
  ADD CONSTRAINT "products_slug_ck" CHECK ("slug" ~ '^[a-z0-9-]+$'),
  ADD CONSTRAINT "products_price_ck" CHECK ("price" >= 0);

-- orders ---------------------------------------------------------------------
-- Every order is owned by exactly one of: a registered user, or a guest holding
-- the bearer token. Without this, a row with neither would be unreachable by
-- anyone but an admin.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_owner_ck"
    CHECK ("user_id" IS NOT NULL OR "guest_token" IS NOT NULL),
  ADD CONSTRAINT "orders_total_amount_ck" CHECK ("total_amount" >= 0),
  ADD CONSTRAINT "orders_notes_ck" CHECK (length("notes") <= 500),
  ADD CONSTRAINT "orders_admin_note_ck" CHECK (length("admin_note") <= 500),
  ADD CONSTRAINT "orders_contact_name_ck"
    CHECK (length(btrim("contact_name")) BETWEEN 1 AND 60),
  ADD CONSTRAINT "orders_contact_mobile_ck"
    CHECK ("contact_mobile" ~ '^\+?[0-9]{10,15}$'),
  ADD CONSTRAINT "orders_company_name_ck"
    CHECK (length(btrim("company_name")) BETWEEN 1 AND 80),
  ADD CONSTRAINT "orders_team_name_ck"
    CHECK (length(btrim("team_name")) BETWEEN 1 AND 80);

-- order_items ----------------------------------------------------------------
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_ck" CHECK ("quantity" BETWEEN 1 AND 20),
  ADD CONSTRAINT "order_items_unit_price_ck" CHECK ("unit_price" >= 0);

-- payments -------------------------------------------------------------------
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_ck" CHECK ("amount" >= 0),
  -- A payment cannot claim a receipt was submitted when no file exists.
  ADD CONSTRAINT "payments_receipt_required_ck"
    CHECK ("status" <> 'submitted' OR "receipt_path" IS NOT NULL),
  ADD CONSTRAINT "payments_reject_reason_ck"
    CHECK (length("reject_reason") <= 300);

-- order_status_history -------------------------------------------------------
ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_note_ck" CHECK (length("note") <= 500);
