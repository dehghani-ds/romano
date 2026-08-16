import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { formatCardNumber } from '@romano/domain';
import { Icon } from './icon';

/**
 * The card to transfer to, shown wherever a receipt is asked for — at checkout
 * and again on the order page, because the person who pays is not always looking
 * at the screen where they ordered.
 *
 * The holder and number are inputs rather than a constant compiled in: they come
 * from `GET /api/payments/options`, so changing whose card receives money is an
 * edit in the dashboard instead of a code change and two bundle deploys.
 *
 * The number is displayed grouped but copied bare: banking apps reject the
 * dashes. Latin digits stay Latin here — it is an identifier someone retypes
 * into their bank, so `.code` carries the bidi isolate that keeps the groups in
 * order inside Persian text.
 */
@Component({
  selector: 'app-payment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="pay">
      <p class="pay__lead">مبلغ سفارش را کارت‌به‌کارت کنید، سپس رسید را بارگذاری کنید.</p>

      <div class="pay__row">
        <span class="pay__number code">{{ grouped() }}</span>
        <button
          type="button"
          class="pay__copy"
          (click)="copy()"
          [attr.aria-label]="copied() ? 'شمارهٔ کارت کپی شد' : 'کپی شمارهٔ کارت'"
        >
          <app-icon [name]="copied() ? 'check' : 'copy'" [size]="18" />
        </button>
      </div>

      <p class="pay__holder">
        <app-icon name="user" [size]="14" />
        <span>به نام {{ holder() }}</span>
      </p>

      <!-- Polite, so it is announced without interrupting; the icon swap alone
           would tell a sighted user and nobody else. -->
      <p class="pay__status" role="status" aria-live="polite">
        @if (copied()) {
          شمارهٔ کارت کپی شد.
        }
      </p>
    </div>
  `,
  styles: `
    .pay {
      margin-top: var(--space-md);
      padding: var(--space-md);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      background: var(--c-surface-2);
    }

    .pay__lead {
      margin-bottom: var(--space-sm);
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .pay__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
    }

    /* Positioned by the row's space-between, deliberately not by a margin here:
       .code makes this a direction: ltr island, so margin-inline-* would resolve
       against LTR and push the digits away from the card's inline-start. */
    .pay__number {
      min-width: 0;
      font-size: var(--fs-h3);
      font-weight: 600;
      letter-spacing: 0.04em;
      /* A card number that breaks across two lines is unreadable and easy to
         mistype, so it never wraps — it steps down instead. */
      white-space: nowrap;
    }

    @media (max-width: 480px) {
      .pay__number {
        font-size: var(--fs-body);
        letter-spacing: normal;
      }
    }

    .pay__copy {
      flex: none;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--c-border-strong);
      border-radius: var(--radius-md);
      background: var(--c-surface);
      color: var(--c-primary);
      cursor: pointer;
      transition: background var(--dur-base) var(--ease-out);

      &:hover {
        background: var(--c-primary-tint);
      }

      &:active {
        transform: scale(0.98);
      }

      &:focus-visible {
        outline: 2px solid var(--c-ring);
        outline-offset: 2px;
      }
    }

    .pay__holder {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      margin-top: var(--space-sm);
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .pay__status {
      font-size: var(--fs-xs);
      color: var(--c-success);

      &:empty {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pay__copy {
        transition-duration: 1ms;

        &:active {
          transform: none;
        }
      }
    }
  `,
})
export class PaymentCard {
  readonly holder = input.required<string>();
  /** Bare digits, as stored and as copied. */
  readonly number = input.required<string>();

  protected readonly grouped = computed(() => formatCardNumber(this.number()));

  protected readonly copied = signal(false);

  private timer?: ReturnType<typeof setTimeout>;

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.number());
    } catch {
      // Clipboard is blocked without a secure context or permission. Selecting
      // the number by hand still works, so this stays quiet rather than raising
      // an error the person cannot act on.
      return;
    }

    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), 2000);
  }
}
