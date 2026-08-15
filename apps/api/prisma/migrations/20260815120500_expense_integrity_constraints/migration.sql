-- Integrity rules for `expenses`, in the same spirit as the original
-- `integrity_constraints` migration: the business rules live in
-- ExpensesService, and what stays here is the narrow set of facts that must be
-- true of a row no matter which code path wrote it.
--
-- The one rule deliberately *not* here is "spent_at is not in the future". That
-- is a judgement about today, and a CHECK constraint would re-evaluate it on
-- every later UPDATE — an expense correctly filed for today would become
-- unwritable tomorrow. It lives in the service, where "today" means today in
-- Tehran.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_ck" CHECK ("amount" > 0),
  ADD CONSTRAINT "expenses_title_ck"
    CHECK (length(btrim("title")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "expenses_note_ck" CHECK (length("note") <= 500),
  ADD CONSTRAINT "expenses_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$');
