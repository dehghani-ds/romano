import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Signed-in users only.
 *
 * Note what this is *not* on any more: `/order`. Ordering works without an
 * account, so the checkout route is open to everyone.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (auth.isSignedIn()) return true;
  return router.createUrlTree(['/signin'], { queryParams: { redirect: state.url } });
};

/** Keeps signed-in users off the sign-in and sign-up screens. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.isSignedIn() ? router.createUrlTree(['/orders']) : true;
};
