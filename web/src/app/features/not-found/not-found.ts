import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/empty-state';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyState],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <app-empty-state
          icon="search"
          title="Page not found"
          message="That link does not lead anywhere. It may have moved."
        >
          <a routerLink="/" class="btn btn--primary" style="margin-top: var(--space-sm)">
            Back home
          </a>
        </app-empty-state>
      </div>
    </div>
  `,
})
export class NotFound {}
