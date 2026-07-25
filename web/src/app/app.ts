import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './layout/header';
import { ToastHost } from './shared/toast-host';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Header, ToastHost],
  template: `
    <a class="skip-link" href="#main">رفتن به محتوای اصلی</a>
    <app-header />
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
    <app-toast-host />
  `,
  styles: `
    main:focus {
      outline: none;
    }
  `,
})
export class App {}
