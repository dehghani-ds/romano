import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Wait for the stored session to be restored before deciding anything. */
async function waitUntilReady(auth: AuthService): Promise<void> {
  if (auth.ready()) return;
  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (auth.ready()) {
        clearInterval(poll);
        resolve();
      }
    }, 20);
  });
}

/** Signed-in users only. Sends visitors to sign-in, remembering where they were going. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await waitUntilReady(auth);

  if (auth.isSignedIn()) return true;
  return router.createUrlTree(['/signin'], { queryParams: { redirect: state.url } });
};

/** Admins only. A signed-in customer is sent to their orders, not to sign-in. */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await waitUntilReady(auth);

  if (!auth.isSignedIn()) {
    return router.createUrlTree(['/signin'], { queryParams: { redirect: state.url } });
  }

  if (!auth.profile()) await auth.loadProfile();

  return auth.isAdmin() ? true : router.createUrlTree(['/orders']);
};

/** Keeps signed-in users off the sign-in and sign-up screens. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await waitUntilReady(auth);

  return auth.isSignedIn() ? router.createUrlTree(['/order']) : true;
};
