-- Zibal payment sessions.
--
-- `gateway_track_id` is unique because it is the only handle the gateway's
-- callback carries. That callback arrives unauthenticated, on a redirect from
-- the customer's own browser, so the trackId has to land on exactly one payment
-- or on none — never on a second row a replayed callback could settle.

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "gateway_card_number" TEXT,
ADD COLUMN     "gateway_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "gateway_track_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_track_id_key" ON "payments"("gateway_track_id");
