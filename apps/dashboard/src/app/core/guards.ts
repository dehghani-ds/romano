import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Everything in this app is admin-only. */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (auth.isSignedIn()) return true;
  return router.createUrlTree(['/signin'], { queryParams: { redirect: state.url } });
};

export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.isSignedIn() ? router.createUrlTree(['/']) : true;
};
