import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

/** Renders the toast stack. Announces politely; never takes focus. */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="host" role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [attr.data-kind]="toast.kind">
          <app-icon
            [name]="toast.kind === 'success' ? 'check-circle' : toast.kind === 'error' ? 'alert' : 'clock'"
            [size]="18"
          />
          <span class="toast__message">{{ toast.message }}</span>
          <button type="button" class="toast__close" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .host {
      position: fixed;
      top: var(--space-md);
      right: var(--space-md);
      left: var(--space-md);
      z-index: var(--z-toast);
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      pointer-events: none;
    }

    @media (min-width: 768px) {
      .host {
        left: auto;
        max-width: 380px;
      }
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      padding: var(--space-md);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      border: 1px solid;
      font-size: var(--fs-sm);
      pointer-events: auto;
      animation: toast-in var(--dur-slow) var(--ease-out);
    }

    .toast[data-kind='success'] {
      background: var(--c-status-done-bg);
      border-color: var(--c-success);
      color: var(--c-status-done-fg);
    }
    .toast[data-kind='error'] {
      background: var(--c-status-cancelled-bg);
      border-color: var(--c-danger);
      color: var(--c-status-cancelled-fg);
    }
    .toast[data-kind='info'] {
      background: var(--c-status-progress-bg);
      border-color: var(--c-info);
      color: var(--c-status-progress-fg);
    }

    .toast__message {
      flex: 1;
    }

    .toast__close {
      background: none;
      border: 0;
      padding: 2px;
      cursor: pointer;
      color: inherit;
      opacity: 0.7;

      &:hover {
        opacity: 1;
      }
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
