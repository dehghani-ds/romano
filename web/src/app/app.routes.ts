import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';

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
    path: 'order',
    title: 'سفارش رومانو · رومانو',
    canActivate: [authGuard],
    loadComponent: () => import('./features/order/new-order').then((m) => m.NewOrder),
  },
  {
    path: 'orders',
    title: 'سفارش‌های من · رومانو',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/my-orders').then((m) => m.MyOrders),
  },
  {
    path: 'orders/:id',
    title: 'سفارش · رومانو',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/order-detail').then((m) => m.OrderDetailPage),
  },
  {
    path: 'profile',
    title: 'پروفایل شما · رومانو',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'admin',
    title: 'مدیریت · رومانو',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-orders').then((m) => m.AdminOrders),
  },
  {
    path: '**',
    title: 'صفحه پیدا نشد · رومانو',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
