import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ORDER_STATUS_META, OrderDetail, OrderStatusHistoryEntry, PAYMENT_STATUS_META, formatDateTime, formatDeliveryDate, formatMoney, pluralCups } from '@romano/domain';
import { Icon, PaymentCard, Spinner, StatusChip, ToastService } from '@romano/ui';

import { OrdersService } from '../../core/orders.service';

@Component({
  selector: 'app-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, StatusChip, Spinner, PaymentCard],
  template: `
    <div class="container container--narrow page">
      <a routerLink="/orders" class="back">
        <app-icon name="chevron-right" [size]="16" />
        همهٔ سفارش‌ها
      </a>

      @if (loading()) {
        <div class="card stack" aria-busy="true">
          <div class="skeleton" style="height: 32px; width: 50%"></div>
          <div class="skeleton" style="height: 140px"></div>
        </div>
      } @else if (error(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (order(); as o) {
        <header class="head">
          <div>
            <p class="code muted text-sm">{{ o.orderNumber }}</p>
            <h1 class="title">{{ deliveryDate(o.deliveryDate) }}</h1>
          </div>
          <app-status-chip [status]="o.status" />
        </header>

        <p class="muted status-note">{{ statusMeta().description }}</p>

        <!-- What was ordered -------------------------------------------- -->
        <section class="card">
          <h2 class="section-title">سفارش شما</h2>
          <dl class="rows">
            <div class="row">
              <dt class="muted">قهوه</dt>
              <dd>{{ o.productNames || 'رومانو' }} · {{ cups(o.totalCups) }}</dd>
            </div>
            <div class="row">
              <dt class="muted">محل تحویل</dt>
              <dd>
                <app-icon name="users" [size]="15" />
                {{ destination() }}
              </dd>
            </div>
            <div class="row">
              <dt class="muted">تحویل‌گیرنده</dt>
              <dd>{{ o.contactName }} · <span class="code">{{ o.contactMobile }}</span></dd>
            </div>
            @if (o.notes) {
              <div class="row">
                <dt class="muted">یادداشت شما</dt>
                <dd>{{ o.notes }}</dd>
              </div>
            }
            <div class="row row--total">
              <dt>مجموع</dt>
              <dd class="numeric">{{ money(o.totalAmount, o.currency) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Payment ------------------------------------------------------ -->
        <section class="card">
          <h2 class="section-title">پرداخت</h2>

          @if (o.payment; as payment) {
            <p class="payment-state">
              <app-icon
                [name]="
                  payment.status === 'verified'
                    ? 'check-circle'
                    : payment.status === 'rejected'
                      ? 'x-circle'
                      : 'receipt'
                "
                [size]="18"
              />
              <span>
                <strong>{{ paymentMeta().label }}</strong>
                — {{ paymentMeta().hint }}
              </span>
            </p>

            @if (payment.rejectReason) {
              <div class="alert alert--error" role="alert">
                <app-icon name="alert" [size]="18" />
                <span>{{ payment.rejectReason }}</span>
              </div>
            }

            @if (payment.hasReceipt) {
              <button type="button" class="btn btn--secondary btn--sm" (click)="viewReceipt()">
                <app-icon name="receipt" [size]="16" />
                دیدن رسید بارگذاری‌شده
              </button>
            }

            @if (canUpload()) {
              @if (payment.status !== 'verified') {
                <app-payment-card />
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
        </section>

        <!-- Timeline ----------------------------------------------------- -->
        <section class="card">
          <h2 class="section-title">روند سفارش</h2>
          @if (history().length === 0) {
            <p class="muted text-sm">هنوز به‌روزرسانی‌ای نیست.</p>
          } @else {
            <ol class="timeline">
              @for (entry of history(); track entry.id) {
                <li class="timeline__item">
                  <span class="timeline__dot" [attr.data-status]="entry.toStatus"></span>
                  <div>
                    <p class="timeline__label">{{ statusLabel(entry) }}</p>
                    <p class="muted text-sm">{{ dateTime(entry.createdAt) }}</p>
                    @if (entry.note) {
                      <p class="text-sm timeline__note">{{ entry.note }}</p>
                    }
                  </div>
                </li>
              }
            </ol>
          }
        </section>

        @if (o.adminNote) {
          <div class="alert alert--info">
            <app-icon name="alert" [size]="18" />
            <span><strong>یادداشت تیم:</strong> {{ o.adminNote }}</span>
          </div>
        }

        @if (o.status === 'pending') {
          <section class="card danger-zone">
            <h2 class="section-title">لغو این سفارش</h2>
            <p class="muted text-sm">
              تا وقتی سفارش در انتظار است می‌توانید آن را پس بگیرید. پس از تأیید مدیر، لغو آن را
              از خودش بخواهید.
            </p>
            <button
              type="button"
              class="btn btn--danger btn--sm"
              (click)="cancel()"
              [disabled]="cancelling()"
            >
              @if (cancelling()) {
                <app-spinner [size]="16" label="در حال لغو" />
              } @else {
                لغو سفارش
              }
            </button>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .back {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      min-height: 44px;
      color: var(--c-fg-muted);
      text-decoration: none;
      font-size: var(--fs-sm);
      font-weight: 500;

      &:hover {
        color: var(--c-primary);
      }
    }

    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-md);
      margin-top: var(--space-sm);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
      margin-top: var(--space-xs);
    }

    .status-note {
      margin-top: var(--space-xs);
      margin-bottom: var(--space-lg);
      font-size: var(--fs-sm);
    }

    .card + .card,
    .card + .alert,
    .alert + .card {
      margin-top: var(--space-md);
    }

    .section-title {
      font-size: var(--fs-body);
      font-weight: 600;
      margin-bottom: var(--space-md);
    }

    .rows {
      margin: 0;
      display: grid;
      gap: var(--space-sm);
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-md);
    }

    .row dt,
    .row dd {
      margin: 0;
    }

    .row dd {
      text-align: end;
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
    }

    .row--total {
      margin-top: var(--space-xs);
      padding-top: var(--space-md);
      border-top: 1px solid var(--c-border);
      font-weight: 600;
      font-size: var(--fs-h3);
    }

    .payment-state {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      font-size: var(--fs-sm);
      margin-bottom: var(--space-md);
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

    /* Timeline */
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    .timeline__item {
      display: flex;
      gap: var(--space-md);
      align-items: flex-start;
    }

    .timeline__dot {
      flex: none;
      width: 12px;
      height: 12px;
      margin-top: 6px;
      border-radius: var(--radius-full);
      background: var(--c-fg-subtle);
    }

    .timeline__dot[data-status='pending'] {
      background: var(--c-warning);
    }
    .timeline__dot[data-status='in_progress'] {
      background: var(--c-info);
    }
    .timeline__dot[data-status='done'] {
      background: var(--c-success);
    }
    .timeline__dot[data-status='cancelled'] {
      background: var(--c-danger);
    }

    .timeline__label {
      font-weight: 600;
    }

    .timeline__note {
      margin-top: var(--space-xs);
    }

    .danger-zone {
      border-color: var(--c-border-strong);
    }

    .danger-zone .btn {
      margin-top: var(--space-md);
    }
  `,
})
export class OrderDetailPage {
  /** Bound from the `:id` route parameter by withComponentInputBinding(). */
  readonly id = input.required<string>();

  private readonly ordersService = inject(OrdersService);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly history = signal<OrderStatusHistoryEntry[]>([]);

  protected readonly pendingFile = signal<File | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly cancelling = signal(false);

  protected readonly deliveryDate = formatDeliveryDate;
  protected readonly dateTime = formatDateTime;
  protected readonly money = formatMoney;
  protected readonly cups = pluralCups;

  protected readonly statusMeta = computed(
    () => ORDER_STATUS_META[this.order()?.status ?? 'pending'],
  );

  protected readonly paymentMeta = computed(
    () => PAYMENT_STATUS_META[this.order()?.payment?.status ?? 'awaiting_receipt'],
  );

  /** A receipt can be attached until the order is finished or cancelled. */
  protected readonly canUpload = computed(() => {
    const status = this.order()?.status;
    return status === 'pending' || status === 'in_progress';
  });

  protected readonly destination = computed(() => {
    const order = this.order();
    return order ? `${order.companyName} — ${order.teamName}` : '';
  });

  constructor() {
    // A required input is not populated until after construction, so the fetch
    // is driven by an effect. Keying it on id() also reloads the page when the
    // router reuses this component to show a different order.
    effect(() => {
      const orderId = this.id();
      void this.load(orderId);
    });
  }

  private async load(orderId = this.id()): Promise<void> {
    this.loading.set(true);
    try {
      const order = await this.ordersService.byId(orderId);
      this.order.set(order);
      this.history.set(await this.ordersService.history(order.id));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(entry: OrderStatusHistoryEntry): string {
    const to = ORDER_STATUS_META[entry.toStatus].label;
    // The arrow points the way the eye moves in an RTL page: from → to.
    return entry.fromStatus
      ? `${ORDER_STATUS_META[entry.fromStatus].label} ← ${to}`
      : `سفارش ثبت شد — ${to}`;
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
    const order = this.order();
    if (!file || !order) return;

    this.uploading.set(true);
    this.uploadError.set(null);

    try {
      await this.ordersService.uploadReceipt(order.id, file);
      this.pendingFile.set(null);
      this.toasts.success('رسید بارگذاری شد. مدیر به‌زودی آن را بررسی می‌کند.');
      await this.load();
    } catch (err) {
      this.uploadError.set((err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }

  /**
   * The receipt sits behind an authenticated endpoint, so a plain link cannot
   * reach it — fetch the bytes, hand the tab an object URL, then release it.
   */
  protected async viewReceipt(): Promise<void> {
    const order = this.order();
    if (!order?.payment?.hasReceipt) return;

    try {
      const url = await this.ordersService.receiptObjectUrl(order.id);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      this.toasts.error((err as Error).message);
    }
  }

  protected async cancel(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const confirmed = confirm(
      `سفارش ${order.orderNumber} لغو شود؟ این کار برگشت‌پذیر نیست.`,
    );
    if (!confirmed) return;

    this.cancelling.set(true);
    try {
      await this.ordersService.cancel(order.id);
      this.toasts.success('سفارش لغو شد.');
      await this.load();
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.cancelling.set(false);
    }
  }
}
