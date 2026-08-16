import { Routes } from '@angular/router';

import { adminGuard, signedOutGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'signin',
    title: 'ورود مدیر · داشبورد رومانو',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/signin/admin-sign-in').then((m) => m.AdminSignIn),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'خلاصه · داشبورد رومانو',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/stats/stats-page').then((m) => m.StatsPage),
  },
  {
    path: 'orders',
    title: 'سفارش‌ها · داشبورد رومانو',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/orders/orders-page').then((m) => m.OrdersPage),
  },
  {
    path: 'orders/:id',
    title: 'سفارش · داشبورد رومانو',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/orders/order-detail-page').then((m) => m.OrderDetailPage),
  },
  {
    path: 'products',
    title: 'محصول‌ها · داشبورد رومانو',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/products/products-page').then((m) => m.ProductsPage),
  },
  {
    path: 'expenses',
    title: 'هزینه‌ها · داشبورد رومانو',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/expenses/expenses-page').then((m) => m.ExpensesPage),
  },
  {
    path: 'settings/payment',
    title: 'تنظیمات پرداخت · داشبورد رومانو',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/settings/payment-settings-page').then((m) => m.PaymentSettingsPage),
  },
  { path: '**', redirectTo: '' },
];
