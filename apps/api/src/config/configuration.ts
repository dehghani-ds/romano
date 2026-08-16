import { resolve } from 'node:path';

/**
 * Every environment value the API reads, resolved once and typed.
 * Anything missing that has no sensible default fails here rather than at the
 * call site, so a misconfigured deployment dies at boot instead of at checkout.
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  jwt: {
    secret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  uploadDir: string;
}

// Payment configuration is deliberately absent from this file. The card money is
// transferred to, and every Zibal value including the merchant credential, live
// in the `payment_settings` table so that an admin can change them from the
// dashboard without a deploy. See `payments/payment-settings.service.ts`.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function configuration(): AppConfig {
  return {
    // Deliberately API_PORT, not PORT: Nx loads the root .env into every task,
    // and Angular's dev server lets a bare PORT override its own port option —
    // a generic name here would drag `nx serve web` onto the API's port.
    port: Number(process.env['API_PORT'] ?? 3000),
    databaseUrl: required('DATABASE_URL'),
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:4200,http://localhost:4300')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    jwt: {
      secret: required('JWT_SECRET'),
      accessTtl: process.env['JWT_ACCESS_TTL'] ?? '15m',
      refreshTtl: process.env['JWT_REFRESH_TTL'] ?? '30d',
    },
    uploadDir: resolve(process.env['UPLOAD_DIR'] ?? './apps/api/uploads'),
  };
}
