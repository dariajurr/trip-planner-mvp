import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'days' },
  {
    path: 'days',
    title: 'Дни',
    loadComponent: () => import('./features/days/days-page').then(m => m.DaysPage),
  },
  {
    path: 'bookings',
    title: 'Брони',
    loadComponent: () => import('./features/bookings/bookings-page').then(m => m.BookingsPage),
  },
  {
    path: 'places',
    title: 'Точки',
    loadComponent: () => import('./features/places/places-page').then(m => m.PlacesPage),
  },
  {
    path: 'routes',
    title: 'Маршруты',
    loadComponent: () => import('./features/routes/routes-page').then(m => m.RoutesPage),
  },
  {
    path: 'routes/:id',
    title: 'Маршрут',
    loadComponent: () => import('./features/routes/route-page').then(m => m.RoutePage),
  },
  {
    path: 'sync',
    title: 'Синхронизация',
    loadComponent: () => import('./features/sync/sync-page').then(m => m.SyncPage),
  },
  { path: '**', redirectTo: 'days' },
];
