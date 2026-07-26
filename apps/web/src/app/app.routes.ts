import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    path: '',
    title: 'رومانو — قهوهٔ فردا',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'signin',
    title: 'ورود · رومانو',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/sign-in').then((m) => m.SignIn),
  },
  {
    path: 'signup',
    title: 'ساخت حساب · رومانو',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/sign-up').then((m) => m.SignUp),
  },
  {
    // Deliberately unguarded — ordering without an account is the point.
    path: 'order',
    title: 'سفارش رومانو · رومانو',
    loadComponent: () => import('./features/order/new-order').then((m) => m.NewOrder),
  },
  {
    // Guests see the orders this browser still holds tokens for.
    path: 'orders',
    title: 'سفارش‌های من · رومانو',
    loadComponent: () => import('./features/orders/my-orders').then((m) => m.MyOrders),
  },
  {
    path: 'orders/:id',
    title: 'سفارش · رومانو',
    loadComponent: () => import('./features/orders/order-detail').then((m) => m.OrderDetailPage),
  },
  {
    path: 'track',
    title: 'پیگیری سفارش · رومانو',
    loadComponent: () => import('./features/track/track-order').then((m) => m.TrackOrder),
  },
  {
    path: 'profile',
    title: 'پروفایل شما · رومانو',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: '**',
    title: 'صفحه پیدا نشد · رومانو',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
