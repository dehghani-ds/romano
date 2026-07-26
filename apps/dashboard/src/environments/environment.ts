/**
 * The dev server proxies `/api` to the NestJS app on :3000 — see proxy.conf.json.
 * Nothing secret belongs in this file; the browser only ever holds a user's own
 * access token, issued at sign-in.
 */
export const environment = {
  production: false,
  apiBaseUrl: '/api',
};
