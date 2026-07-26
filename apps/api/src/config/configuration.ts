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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function configuration(): AppConfig {
  return {
    port: Number(process.env['PORT'] ?? 3000),
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
