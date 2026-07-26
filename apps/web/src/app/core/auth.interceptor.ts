import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { apiUrl } from './api';
import { TokenStore, type StoredTokens } from './token.store';

/** Routes that mint tokens — sending an expired one to them helps nobody. */
const ANONYMOUS_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

/**
 * Only one refresh runs at a time. Without this, a page that fires four
 * requests at once on a stale token would burn four refresh round-trips and
 * race over which result is stored.
 */
let inFlightRefresh: Promise<StoredTokens | null> | null = null;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const tokens = inject(TokenStore);

  if (ANONYMOUS_PATHS.some((path) => request.url.includes(path))) {
    return next(request);
  }

  const send = (accessToken: string | null) =>
    next(accessToken ? withBearer(request, accessToken) : request);

  return send(tokens.accessToken()).pipe(
    catchError((error: unknown) => {
      const refreshToken = tokens.tokens()?.refreshToken;
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !refreshToken) {
        return throwError(() => error);
      }

      return from(refreshOnce(refreshToken, tokens)).pipe(
        switchMap((refreshed) => {
          if (!refreshed) return throwError(() => error);
          return next(withBearer(request, refreshed.accessToken));
        }),
      );
    }),
  );
};

function withBearer<T>(request: HttpRequest<T>, accessToken: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } });
}

async function refreshOnce(refreshToken: string, store: TokenStore): Promise<StoredTokens | null> {
  inFlightRefresh ??= (async () => {
    try {
      const response = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        store.clear();
        return null;
      }

      const session = (await response.json()) as StoredTokens;
      store.set({ accessToken: session.accessToken, refreshToken: session.refreshToken });
      return session;
    } catch {
      return null;
    } finally {
      // Cleared on the next tick so callers queued behind this one still see it.
      queueMicrotask(() => {
        inFlightRefresh = null;
      });
    }
  })();

  return inFlightRefresh;
}
