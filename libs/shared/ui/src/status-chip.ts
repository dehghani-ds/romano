import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ORDER_STATUS_META, OrderStatus } from '@romano/domain';
import { Icon, IconName } from './icon';

/**
 * Order status as colour + icon + text. Colour alone never carries the meaning
 * — see the accessibility contract in the design system.
 */
@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <span class="chip" [attr.data-status]="status()">
      <app-icon [name]="icon()" [size]="14" />
      {{ meta().label }}
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 4px 10px;
      border-radius: var(--radius-full);
      font-size: var(--fs-xs);
      font-weight: 600;
      white-space: nowrap;
    }

    .chip[data-status='pending'] {
      color: var(--c-status-pending-fg);
      background: var(--c-status-pending-bg);
    }
    .chip[data-status='in_progress'] {
      color: var(--c-status-progress-fg);
      background: var(--c-status-progress-bg);
    }
    .chip[data-status='done'] {
      color: var(--c-status-done-fg);
      background: var(--c-status-done-bg);
    }
    .chip[data-status='cancelled'] {
      color: var(--c-status-cancelled-fg);
      background: var(--c-status-cancelled-bg);
    }
  `,
})
export class StatusChip {
  readonly status = input.required<OrderStatus>();

  protected readonly meta = computed(() => ORDER_STATUS_META[this.status()]);
  protected readonly icon = computed(() => this.meta().icon as IconName);
}
