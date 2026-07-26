import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CitrusBackdrop, ToastHost } from '@romano/ui';

import { Header } from './layout/header';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Header, CitrusBackdrop, ToastHost],
  template: `
    <a class="skip-link" href="#main">رفتن به محتوای اصلی</a>
    <app-citrus-backdrop />
    <app-header />
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
    <app-toast-host />
  `,
  styles: `
    /* The backdrop is fixed at the base layer; content sits one step above it. */
    main {
      position: relative;
      z-index: 1;
    }

    main:focus {
      outline: none;
    }
  `,
})
export class App {}
