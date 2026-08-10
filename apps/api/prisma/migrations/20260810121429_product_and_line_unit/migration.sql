-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'فنجان';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'فنجان';
