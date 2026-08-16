-- How Romano takes money, moved out of code and environment and into a row an
-- admin can edit.
--
-- Two things used to need a developer: the card-to-card destination was a
-- constant compiled into both Angular bundles, and the gateway credentials were
-- environment variables read at boot. Neither could be changed without a deploy.

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "card_to_card_enabled" BOOLEAN NOT NULL DEFAULT true,
    "card_holder" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "online_enabled" BOOLEAN NOT NULL DEFAULT false,
    "zibal_merchant" TEXT,
    "zibal_base_url" TEXT NOT NULL DEFAULT 'https://gateway.zibal.ir',
    "zibal_callback_url" TEXT,
    "web_base_url" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The one row.
--
-- Seeded with the card-to-card details that were previously hardcoded in
-- `libs/shared/domain/src/models.ts`, so that nothing a customer sees changes
-- when this migration runs.
--
-- Online payment starts **off**, with no merchant. A credential does not belong
-- in a committed migration, so there is deliberately nothing here to copy an old
-- environment variable into: an admin enters the key once, in the dashboard.
INSERT INTO "payment_settings" ("id", "card_holder", "card_number", "updated_at")
VALUES (1, 'محمدرضا دهقانی ابیانه', '6219861905572805', CURRENT_TIMESTAMP);
