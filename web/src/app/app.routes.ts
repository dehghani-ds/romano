import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    path: '',
    title: 'Romano — coffee for tomorrow',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'signin',
    title: 'Sign in · Romano',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/sign-in').then((m) => m.SignIn),
  },
  {
    path: 'signup',
    title: 'Create your account · Romano',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/sign-up').then((m) => m.SignUp),
  },
  {
    path: 'order',
    title: 'Order a Romano · Romano',
    canActivate: [authGuard],
    loadComponent: () => import('./features/order/new-order').then((m) => m.NewOrder),
  },
  {
    path: 'orders',
    title: 'My orders · Romano',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/my-orders').then((m) => m.MyOrders),
  },
  {
    path: 'orders/:id',
    title: 'Order · Romano',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/order-detail').then((m) => m.OrderDetailPage),
  },
  {
    path: 'profile',
    title: 'Your profile · Romano',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    path: 'admin',
    title: 'Admin · Romano',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-orders').then((m) => m.AdminOrders),
  },
  {
    path: '**',
    title: 'Page not found · Romano',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
