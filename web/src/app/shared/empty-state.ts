import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from './icon';

/**
 * A helpful empty state: icon, headline, one line of guidance, and room for a
 * single action. Never a bare "no data".
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="empty">
      <span class="empty__icon">
        <app-icon [name]="icon()" [size]="28" />
      </span>
      <h3 class="empty__title">{{ title() }}</h3>
      <p class="muted">{{ message() }}</p>
      <ng-content />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm);
      text-align: center;
      padding: var(--space-2xl) var(--space-md);
    }

    .empty__icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: var(--radius-full);
      background: var(--c-primary-tint);
      color: var(--c-primary);
      margin-bottom: var(--space-xs);
    }

    .empty__title {
      font-family: var(--font-display);
      font-size: var(--fs-h3);
    }
  `,
})
export class EmptyState {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
}
