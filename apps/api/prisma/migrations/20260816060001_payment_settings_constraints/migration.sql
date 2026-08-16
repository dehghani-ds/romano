-- Integrity rules for `payment_settings`, in the same spirit as the earlier
-- `*_integrity_constraints` migrations: the business rules live in
-- `PaymentSettingsService`, and what stays here is the narrow set of facts that
-- must hold no matter which code path wrote the row.
ALTER TABLE "payment_settings"
  -- Settings that can exist twice are settings that can disagree, and every
  -- reader here takes "the row" rather than "a row".
  ADD CONSTRAINT "payment_settings_singleton_ck" CHECK ("id" = 1),

  ADD CONSTRAINT "payment_settings_card_holder_ck"
    CHECK (length(btrim("card_holder")) BETWEEN 1 AND 80),

  -- Bare digits, exactly as a banking app wants them pasted. The grouping a
  -- customer sees (`6219-8619-…`) is display, applied by `formatCardNumber`.
  ADD CONSTRAINT "payment_settings_card_number_ck"
    CHECK ("card_number" ~ '^[0-9]{16}$'),

  -- Zibal issues a hex merchant id. The bound is loose on purpose — this guards
  -- against a pasted sentence, not against Zibal changing their format.
  ADD CONSTRAINT "payment_settings_zibal_merchant_ck"
    CHECK (length("zibal_merchant") BETWEEN 4 AND 128),

  -- Zibal refuses a callback that is not absolute (result 106), so a relative
  -- one is never worth storing.
  ADD CONSTRAINT "payment_settings_zibal_base_url_ck"
    CHECK ("zibal_base_url" ~ '^https?://'),
  ADD CONSTRAINT "payment_settings_zibal_callback_url_ck"
    CHECK ("zibal_callback_url" ~ '^https?://'),
  ADD CONSTRAINT "payment_settings_web_base_url_ck"
    CHECK ("web_base_url" ~ '^https?://');
