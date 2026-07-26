import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmptyState } from '@romano/ui';
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyState],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <app-empty-state
          icon="search"
          title="صفحه پیدا نشد"
          message="این نشانی به جایی نمی‌رسد. شاید جابه‌جا شده باشد."
        >
          <a routerLink="/" class="btn btn--primary" style="margin-top: var(--space-sm)">
            بازگشت به صفحهٔ اصلی
          </a>
        </app-empty-state>
      </div>
    </div>
  `,
})
export class NotFound {}
