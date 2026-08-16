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
  /** Where the customer site lives, so the gateway can send a payer back to it. */
  webBaseUrl: string;
  zibal: ZibalConfig;
}

/**
 * The Zibal IPG.
 *
 * `merchant` is the only required value and it has no default on purpose:
 * online payment is a feature that has to be turned on with a real credential,
 * and an empty string is the honest way to say "not configured". The API then
 * offers receipt upload alone rather than a button that fails at the bank.
 */
export interface ZibalConfig {
  merchant: string;
  baseUrl: string;
  callbackUrl: string;
}

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
    // Trailing slashes are stripped here rather than at every join site, so the
    // redirect back from the gateway cannot come out with `//orders/…`.
    webBaseUrl: trimSlashes(process.env['WEB_BASE_URL'] ?? 'http://localhost:4200'),
    zibal: {
      merchant: process.env['ZIBAL_MERCHANT'] ?? '',
      baseUrl: trimSlashes(process.env['ZIBAL_BASE_URL'] ?? 'https://gateway.zibal.ir'),
      callbackUrl: process.env['ZIBAL_CALLBACK_URL'] ?? '',
    },
  };
}

function trimSlashes(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
