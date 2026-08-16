import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import {
  OrderDetail,
  PAYMENT_CHOICE_META,
  formatMoney,
  paymentStateMeta,
  type CardToCardDestination,
  type PaymentChoice,
} from '@romano/domain';
import { Icon, IconName, PaymentCard, Spinner, ToastService } from '@romano/ui';

import { OrdersService } from '../../core/orders.service';
import { PaymentsService } from '../../core/payments.service';

/**
 * How an order gets paid: the state it is in, and — while it is still open —
 * the choice between paying online and transferring by hand.
 *
 * The two methods are a real fork, not a preference, so they are a radio group
 * rather than two buttons: only one of them applies to a given payment, picking
 * one has to be undoable, and a radio is the control a screen reader already
 * knows how to announce as "one of two". The panel below the group swaps to
 * match, so the card number and the file input are never on screen next to a
 * "pay now" button that would make them pointless.
 *
 * Which choice is offered at all is the server's call: `PaymentsService.options`
 * answers false whenever no gateway credential is configured, and the group
 * collapses to the card-to-card panel alone.
 */
@Component({
  selector: 'app-payment-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Spinner, PaymentCard],
  template: `
    <h2 class="section-title">پرداخت</h2>

    @if (order().payment; as payment) {
      <p class="state">
        <app-icon [name]="stateMeta().icon" [size]="18" />
        <span>
          <strong>{{ stateMeta().label }}</strong>
          — {{ stateMeta().hint }}
        </span>
      </p>

      @if (payment.rejectReason) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ payment.rejectReason }}</span>
        </div>
      }

      @if (payment.status === 'verified' && payment.cardNumber) {
        <p class="paid-with">
          <app-icon name="credit-card" [size]="15" />
          <span>پرداخت‌شده با کارت <span class="code">{{ payment.cardNumber }}</span></span>
        </p>
      }

      @if (payment.hasReceipt) {
        <button type="button" class="btn btn--secondary btn--sm receipt-link" (click)="viewReceipt.emit()">
          <app-icon name="receipt" [size]="16" />
          دیدن رسید بارگذاری‌شده
        </button>
      }

      @if (open()) {
        @if (onlineOffered()) {
          <fieldset class="methods">
            <legend class="methods__legend">روش پرداخت</legend>

            @for (option of choices; track option) {
              <label class="method" [class.is-picked]="choice() === option" [attr.for]="'pay-' + option">
                <!-- Named and described explicitly rather than by the label's
                     text content: the row also holds an icon and a sentence of
                     hint, and letting the name fall out of all of it reads the
                     whole paragraph out before the choice itself. -->
                <input
                  type="radio"
                  name="payment-method"
                  [attr.id]="'pay-' + option"
                  [value]="option"
                  [checked]="choice() === option"
                  [attr.aria-labelledby]="'pay-label-' + option"
                  [attr.aria-describedby]="'pay-hint-' + option"
                  (change)="choice.set(option)"
                />
                <app-icon [name]="meta(option).icon" [size]="20" />
                <span class="method__text">
                  <span class="method__label" [attr.id]="'pay-label-' + option">
                    {{ meta(option).label }}
                  </span>
                  <span class="method__hint" [attr.id]="'pay-hint-' + option">
                    {{ meta(option).hint }}
                  </span>
                </span>
              </label>
            }
          </fieldset>
        }

        @if (choice() === 'online' && onlineOffered()) {
          <!-- Online ------------------------------------------------------- -->
          <p class="lead">
            به درگاه پرداخت زیبال می‌روید و پس از پرداخت به همین صفحه برمی‌گردید.
          </p>

          @if (startError(); as message) {
            <p class="field__error" role="alert">
              <app-icon name="alert" [size]="14" />
              {{ message }}
            </p>
          }

          <button
            type="button"
            class="btn btn--primary pay-online"
            (click)="payOnline()"
            [disabled]="starting()"
            [attr.aria-busy]="starting()"
          >
            @if (starting()) {
              <app-spinner [size]="16" label="در حال رفتن به درگاه" />
            } @else {
              <app-icon name="external-link" [size]="18" />
              پرداخت {{ amount() }}
            }
          </button>
        } @else {
          <!-- Card to card ------------------------------------------------- -->
          @if (cardToCard(); as card) {
            <app-payment-card [holder]="card.holder" [number]="card.number" />
          }

          <label class="upload" [class.is-set]="pendingFile() !== null">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              (change)="onFileSelected($event)"
            />
            <app-icon name="upload" [size]="20" />
            <span>
              {{ pendingFile()?.name ?? (payment.hasReceipt ? 'جایگزینی رسید' : 'بارگذاری رسید') }}
            </span>
          </label>

          @if (uploadError(); as message) {
            <p class="field__error" role="alert">
              <app-icon name="alert" [size]="14" />
              {{ message }}
            </p>
          }

          @if (pendingFile()) {
            <button
              type="button"
              class="btn btn--primary btn--sm"
              (click)="uploadReceipt()"
              [disabled]="uploading()"
              [attr.aria-busy]="uploading()"
            >
              @if (uploading()) {
                <app-spinner [size]="16" label="در حال بارگذاری" />
              } @else {
                بارگذاری رسید
              }
            </button>
          }
        }
      }
    }
  `,
  styles: `
    .section-title {
      font-size: var(--fs-body);
      font-weight: 600;
      margin-bottom: var(--space-md);
    }

    .state {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      font-size: var(--fs-sm);
      margin-bottom: var(--space-md);
    }

    .paid-with {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      margin-bottom: var(--space-md);
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .receipt-link {
      margin-bottom: var(--space-sm);
    }

    /* Method chooser */
    .methods {
      margin-top: var(--space-md);
      padding: 0;
      border: 0;
      display: grid;
      gap: var(--space-sm);
    }

    .methods__legend {
      padding: 0;
      margin-bottom: var(--space-sm);
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--c-fg-muted);
    }

    .method {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      /* ≥44px touch target with room to spare, per the accessibility contract. */
      min-height: 56px;
      padding: var(--space-md);
      border: 1px solid var(--c-border-strong);
      border-radius: var(--radius-md);
      background: var(--c-surface);
      color: var(--c-fg-muted);
      cursor: pointer;
      transition:
        border-color var(--dur-base) var(--ease-out),
        background var(--dur-base) var(--ease-out);

      &:hover {
        border-color: var(--c-primary);
        color: var(--c-fg);
      }

      /* Selection is carried by the border, the tint *and* the native radio —
         never by colour alone. */
      &.is-picked {
        border-color: var(--c-primary);
        background: var(--c-primary-tint);
        color: var(--c-fg);
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--c-ring);
        outline-offset: 2px;
      }

      app-icon {
        flex: none;
        margin-top: 2px;
        color: var(--c-primary);
      }

      input {
        /* Kept in the accessibility tree and focusable — only the default
           rendering is dropped, because the whole row is the control. */
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
    }

    .method__text {
      display: grid;
      gap: 2px;
    }

    .method__label {
      font-weight: 600;
      color: var(--c-fg);
    }

    .method__hint {
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .lead {
      margin-top: var(--space-md);
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
    }

    .pay-online {
      width: 100%;
      margin-top: var(--space-md);
      /* Large primary — this is the one CTA in the section on mobile. */
      min-height: 52px;
      gap: var(--space-sm);
    }

    .upload {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: 56px;
      margin-top: var(--space-md);
      padding: var(--space-md);
      border: 1px dashed var(--c-border-strong);
      border-radius: var(--radius-md);
      color: var(--c-fg-muted);
      cursor: pointer;

      &:hover {
        border-color: var(--c-primary);
        color: var(--c-fg);
      }

      &.is-set {
        border-style: solid;
        border-color: var(--c-primary);
        background: var(--c-primary-tint);
        color: var(--c-fg);
      }

      input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--c-ring);
        outline-offset: 2px;
      }
    }

    .upload + .btn,
    .field__error + .btn {
      margin-top: var(--space-md);
    }

    @media (prefers-reduced-motion: reduce) {
      .method {
        transition-duration: 1ms;
      }
    }
  `,
})
export class PaymentSection {
  readonly order = input.required<OrderDetail>();
  /** True once the gateway has confirmed it is configured. */
  readonly onlineEnabled = input<boolean>(false);
  /** Null while loading, and when an admin has switched card-to-card off. */
  readonly cardToCard = input<CardToCardDestination | null>(null);

  /** The parent owns reloading the order and opening the stored receipt. */
  readonly changed = output<void>();
  readonly viewReceipt = output<void>();

  private readonly ordersService = inject(OrdersService);
  private readonly payments = inject(PaymentsService);
  private readonly toasts = inject(ToastService);

  protected readonly choices: PaymentChoice[] = ['online', 'receipt'];
  protected readonly choice = signal<PaymentChoice>('online');

  protected readonly pendingFile = signal<File | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);

  // `icon` is a plain string in @romano/domain — the domain library does not
  // depend on the icon set — so it is narrowed here, at the boundary, the same
  // way StatusChip does it.
  protected readonly stateMeta = computed(() => {
    const meta = paymentStateMeta(this.order().payment);
    return { ...meta, icon: meta.icon as IconName };
  });

  /** A payment can still be settled until the order is delivered or called off. */
  protected readonly open = computed(() => {
    const order = this.order();
    if (order.payment?.status === 'verified') return false;
    return order.status === 'pending' || order.status === 'in_progress';
  });

  protected readonly onlineOffered = computed(() => this.onlineEnabled());

  protected readonly amount = computed(() => {
    const order = this.order();
    return formatMoney(order.totalAmount, order.currency);
  });

  protected meta(choice: PaymentChoice): { label: string; hint: string; icon: IconName } {
    const meta = PAYMENT_CHOICE_META[choice];
    return { ...meta, icon: meta.icon as IconName };
  }

  protected async payOnline(): Promise<void> {
    const order = this.order();
    this.starting.set(true);
    this.startError.set(null);

    try {
      const { redirectUrl } = await this.payments.start(order.id);
      // Leaves the site. The busy state is never cleared on purpose — the
      // button must not flick back to "pay" while the navigation is in flight.
      window.location.assign(redirectUrl);
    } catch (err) {
      this.startError.set((err as Error).message);
      this.starting.set(false);
    }
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.uploadError.set(null);

    if (file && file.size > 5 * 1024 * 1024) {
      this.uploadError.set('حجم این فایل بیشتر از ۵ مگابایت است. فایل کوچک‌تری انتخاب کنید.');
      this.pendingFile.set(null);
      input.value = '';
      return;
    }

    this.pendingFile.set(file);
  }

  protected async uploadReceipt(): Promise<void> {
    const file = this.pendingFile();
    if (!file) return;

    this.uploading.set(true);
    this.uploadError.set(null);

    try {
      await this.ordersService.uploadReceipt(this.order().id, file);
      this.pendingFile.set(null);
      this.toasts.success('رسید بارگذاری شد. مدیر به‌زودی آن را بررسی می‌کند.');
      this.changed.emit();
    } catch (err) {
      this.uploadError.set((err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }
}
