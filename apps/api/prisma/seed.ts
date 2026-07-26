/**
 * Seed: the one product on sale, and an admin to accept orders with.
 *
 * Idempotent — safe to run against an existing database. The admin password is
 * only ever set on first creation, so re-seeding never resets a changed one.
 */
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

loadEnv();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

async function main(): Promise<void> {
  const product = await prisma.product.upsert({
    where: { slug: 'romano' },
    update: {
      name: 'رومانو',
      description:
        'اسپرسوی کوتاه و روشن، با یک برش لیمو روی لبهٔ فنجان. هر فنجان صبح فردا تازه دم می‌شود.',
      price: 45000,
      currency: 'IRR',
      isActive: true,
      sortOrder: 0,
    },
    create: {
      slug: 'romano',
      name: 'رومانو',
      description:
        'اسپرسوی کوتاه و روشن، با یک برش لیمو روی لبهٔ فنجان. هر فنجان صبح فردا تازه دم می‌شود.',
      price: 45000,
      currency: 'IRR',
      sortOrder: 0,
    },
  });
  console.log(`✓ product ${product.slug}`);

  const username = process.env['ADMIN_USERNAME'] ?? 'admin';
  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
    }
    console.log(`✓ admin ${username} (already existed)`);
    return;
  }

  const password = process.env['ADMIN_PASSWORD'];
  if (!password) {
    console.warn('! ADMIN_PASSWORD not set — skipping admin creation');
    return;
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password),
      firstName: process.env['ADMIN_FIRST_NAME'] ?? 'مدیر',
      lastName: process.env['ADMIN_LAST_NAME'] ?? 'رومانو',
      mobile: process.env['ADMIN_MOBILE'] ?? '09120000000',
      teamName: 'مدیریت',
      role: 'admin',
    },
  });
  console.log(`✓ admin ${username} created`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
