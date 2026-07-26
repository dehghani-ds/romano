/**
 * In production the API is served from the same origin behind a reverse proxy,
 * so a relative base needs no build-time host.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api',
};
