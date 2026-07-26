import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastHost } from '@romano/ui';

import { AuthService } from './core/auth.service';
import { Sidebar } from './layout/sidebar';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, ToastHost],
  template: `
    <a class="skip-link" href="#main">رفتن به محتوای اصلی</a>

    <!-- The sign-in screen is the one route without the console chrome. -->
    @if (auth.isSignedIn()) {
      <app-sidebar />
    }

    <main id="main" tabindex="-1" [class.is-framed]="auth.isSignedIn()">
      <router-outlet />
    </main>

    <app-toast-host />
  `,
  styles: `
    main:focus {
      outline: none;
    }

    /* Leave room for the sidebar once it becomes a fixed rail. */
    @media (min-width: 1024px) {
      main.is-framed {
        margin-inline-start: 248px;
      }
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
}
