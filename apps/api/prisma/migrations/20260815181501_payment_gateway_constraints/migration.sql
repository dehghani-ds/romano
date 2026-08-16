-- Integrity rules for the Zibal columns on `payments`, in the same spirit as the
-- original `integrity_constraints` migration: the business rules live in
-- OrdersService and the payments module, and what stays here is the narrow set
-- of facts that must hold no matter which code path wrote the row.
--
-- What is deliberately *not* here: any rule tying `gateway_track_id` to
-- `method`. Starting an online payment and then changing your mind and
-- uploading a receipt is an ordinary thing for a customer to do, and it leaves a
-- perfectly valid row carrying a spent trackId and `method = 'receipt_upload'`.
ALTER TABLE "payments"
  -- Zibal's trackId is an int64 it renders as digits. Storing it as text keeps
  -- the value exactly as the gateway spelled it; this keeps anything that is
  -- not one of its ids out of the column the callback looks rows up by.
  ADD CONSTRAINT "payments_gateway_track_id_ck"
    CHECK ("gateway_track_id" ~ '^[0-9]{1,20}$'),

  -- A session id with no timestamp cannot be aged out, so the freshness check
  -- that stops a customer opening a second session would silently never fire.
  -- The two columns are written together or not at all.
  ADD CONSTRAINT "payments_gateway_session_ck"
    CHECK (("gateway_track_id" IS NULL) = ("gateway_requested_at" IS NULL)),

  -- A masked pan (`62741****44`), never a payable card number.
  ADD CONSTRAINT "payments_gateway_card_number_ck"
    CHECK (length("gateway_card_number") BETWEEN 1 AND 32);
