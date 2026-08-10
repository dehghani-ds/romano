import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  ORDER_STATUS_META,
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderStatusHistoryEntry,
  PAYMENT_STATUS_META,
  formatDateTime,
  formatDeliveryDate,
  formatMoney,
  formatQuantity,
} from '@romano/domain';
import { Icon, Spinner, StatusChip, ToastService } from '@romano/ui';

import { AdminOrdersService } from '../../core/admin-orders.service';

/**
 * One order, in full — including the receipt review that the old console
 * defined in its service but never put behind a button.
 */
@Component({
  selector: 'app-admin-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, StatusChip, Spinner],
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
            <h1 class="title">{{ date(o.deliveryDate) }}</h1>
          </div>
          <app-status-chip [status]="o.status" />
        </header>

        <!-- Customer ------------------------------------------------------ -->
        <section class="card">
          <h2 class="section-title">مشتری و محل تحویل</h2>
          <dl class="rows">
            <div class="row">
              <dt class="muted">نام</dt>
              <dd>
                {{ o.contactName }}
                @if (o.isGuest) {
                  <span class="badge">مهمان</span>
                } @else if (o.customerUsername) {
                  <span class="muted text-sm code">&#64;{{ o.customerUsername }}</span>
                }
              </dd>
            </div>
            <div class="row">
              <dt class="muted">موبایل</dt>
              <dd class="code">{{ o.contactMobile }}</dd>
            </div>
            <div class="row">
              <dt class="muted">محل تحویل</dt>
              <dd>{{ o.companyName }} — {{ o.teamName }}</dd>
            </div>
            <div class="row row--items">
              <dt class="muted">سبد</dt>
              <dd>
                <ul class="items">
                  @for (item of o.items; track item.productId) {
                    <li class="item">
                      <span>{{ item.productName }}</span>
                      <span class="muted text-sm">{{ quantity(item) }}</span>
                      <span class="item__total numeric">
                        {{ money(item.lineTotal, o.currency) }}
                      </span>
                    </li>
                  }
                </ul>
              </dd>
            </div>
            @if (o.notes) {
              <div class="row">
                <dt class="muted">یادداشت مشتری</dt>
                <dd>{{ o.notes }}</dd>
              </div>
            }
            <div class="row row--total">
              <dt>مجموع</dt>
              <dd class="numeric">{{ money(o.totalAmount, o.currency) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Payment ------------------------------------------------------- -->
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

            <div class="payment-actions">
              @if (payment.hasReceipt) {
                <button type="button" class="btn btn--secondary btn--sm" (click)="viewReceipt()">
                  <app-icon name="receipt" [size]="16" />
                  دیدن رسید
                </button>

                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  [disabled]="reviewing() || payment.status === 'verified'"
                  (click)="review(true)"
                >
                  @if (reviewing()) {
                    <app-spinner [size]="16" label="در حال بررسی" />
                  } @else {
                    تأیید رسید
                  }
                </button>

                <button
                  type="button"
                  class="btn btn--danger btn--sm"
                  [disabled]="reviewing()"
                  (click)="review(false)"
                >
                  رد کردن رسید
                </button>
              } @else {
                <p class="muted text-sm">هنوز رسیدی بارگذاری نشده است.</p>
              }
            </div>
          } @else {
            <p class="muted text-sm">پرداختی برای این سفارش ثبت نشده است.</p>
          }
        </section>

        <!-- Lifecycle ----------------------------------------------------- -->
        <section class="card">
          <h2 class="section-title">تغییر وضعیت</h2>
          @if (actions().length === 0) {
            <p class="muted text-sm">
              این سفارش «{{ statusMeta().label }}» است و دیگر تغییر نمی‌کند.
            </p>
          } @else {
            <div class="actions">
              @for (action of actions(); track action.status) {
                <button
                  type="button"
                  class="btn btn--sm"
                  [class.btn--primary]="action.status !== 'cancelled'"
                  [class.btn--danger]="action.status === 'cancelled'"
                  [disabled]="working()"
                  (click)="apply(action.status)"
                >
                  {{ action.label }}
                </button>
              }
            </div>
          }
        </section>

        <!-- Timeline ------------------------------------------------------ -->
        <section class="card">
          <h2 class="section-title">روند سفارش</h2>
          <ol class="timeline">
            @for (entry of history(); track entry.id) {
              <li class="timeline__item">
                <span class="timeline__dot" [attr.data-status]="entry.toStatus"></span>
                <div>
                  <p class="timeline__label">{{ historyLabel(entry) }}</p>
                  <p class="muted text-sm">{{ dateTime(entry.createdAt) }}</p>
                  @if (entry.note) {
                    <p class="text-sm timeline__note">{{ entry.note }}</p>
                  }
                </div>
              </li>
            }
          </ol>
        </section>
      }
    </div>
  `,
  styles: `
    .row--items dd {
      width: 100%;
    }

    .items {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-xs);
      width: 100%;
    }

    .item {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm);
    }

    .item__total {
      margin-inline-start: auto;
    }

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
      margin-bottom: var(--space-lg);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
      margin-top: var(--space-xs);
    }

    .card + .card {
      margin-top: var(--space-md);
    }

    .section-title {
      font-size: var(--fs-body);
      font-weight: 600;
      margin-bottom: var(--space-md);
    }

    .rows {
      display: grid;
      gap: var(--space-sm);
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-md);
    }

    .row dd {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      text-align: end;
    }

    .row--total {
      margin-top: var(--space-xs);
      padding-top: var(--space-md);
      border-top: 1px solid var(--c-border);
      font-weight: 600;
    }

    .badge {
      padding: 2px var(--space-sm);
      border-radius: var(--radius-full);
      background: var(--c-surface-2);
      color: var(--c-fg-muted);
      font-size: var(--fs-xs);
    }

    .payment-state {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      margin-bottom: var(--space-md);
    }

    .payment-actions,
    .actions {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
    }

    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    .timeline__item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md);
    }

    .timeline__dot {
      flex: none;
      width: 10px;
      height: 10px;
      margin-top: 6px;
      border-radius: var(--radius-full);
      background: var(--c-fg-subtle);

      &[data-status='in_progress'] {
        background: var(--c-status-progress-fg);
      }
      &[data-status='done'] {
        background: var(--c-status-done-fg);
      }
      &[data-status='cancelled'] {
        background: var(--c-status-cancelled-fg);
      }
      &[data-status='pending'] {
        background: var(--c-status-pending-fg);
      }
    }

    .timeline__label {
      font-weight: 500;
    }

    .timeline__note {
      margin-top: var(--space-xs);
      color: var(--c-fg-muted);
    }
  `,
})
export class OrderDetailPage {
  private readonly service = inject(AdminOrdersService);
  private readonly toasts = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly history = signal<OrderStatusHistoryEntry[]>([]);
  protected readonly working = signal(false);
  protected readonly reviewing = signal(false);

  protected readonly date = formatDeliveryDate;
  protected readonly dateTime = formatDateTime;
  protected readonly money = formatMoney;
  /** Each line keeps the unit it was ordered with. */
  protected quantity(item: OrderItem): string {
    return formatQuantity(item.quantity, item.unit);
  }

  protected readonly statusMeta = computed(
    () => ORDER_STATUS_META[this.order()?.status ?? 'pending'],
  );
  protected readonly paymentMeta = computed(
    () => PAYMENT_STATUS_META[this.order()?.payment?.status ?? 'awaiting_receipt'],
  );

  protected readonly actions = computed<{ status: OrderStatus; label: string }[]>(() => {
    const status = this.order()?.status;
    if (status === 'pending') {
      return [
        { status: 'in_progress', label: 'تأیید سفارش' },
        { status: 'cancelled', label: 'لغو سفارش' },
      ];
    }
    if (status === 'in_progress') {
      return [
        { status: 'done', label: 'تحویل شد' },
        { status: 'cancelled', label: 'لغو سفارش' },
      ];
    }
    return [];
  });

  constructor() {
    // A required input is not set until after construction, so the fetch runs
    // from an effect — which also reloads when the router reuses this component.
    effect(() => {
      const orderId = this.id();
      void this.load(orderId);
    });
  }

  private async load(orderId = this.id()): Promise<void> {
    this.loading.set(true);
    try {
      this.order.set(await this.service.byId(orderId));
      this.history.set(await this.service.history(orderId));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected historyLabel(entry: OrderStatusHistoryEntry): string {
    const to = ORDER_STATUS_META[entry.toStatus].label;
    return entry.fromStatus
      ? `${ORDER_STATUS_META[entry.fromStatus].label} ← ${to}`
      : `سفارش ثبت شد — ${to}`;
  }

  protected async apply(status: OrderStatus): Promise<void> {
    const order = this.order();
    if (!order) return;

    let note: string | null = null;
    if (status === 'cancelled') {
      note = prompt(`چرا سفارش ${order.orderNumber} لغو می‌شود؟`);
      if (note === null) return;
    }

    this.working.set(true);
    try {
      this.order.set(await this.service.setStatus(order.id, status, note));
      this.history.set(await this.service.history(order.id));
      this.toasts.success('وضعیت سفارش به‌روزرسانی شد.');
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.working.set(false);
    }
  }

  protected async review(approve: boolean): Promise<void> {
    const order = this.order();
    if (!order) return;

    let reason: string | null = null;
    if (!approve) {
      // The API refuses a rejection without a reason, so ask before sending.
      reason = prompt('چرا این رسید رد می‌شود؟ (برای مشتری نمایش داده می‌شود)');
      if (reason === null) return;
      if (!reason.trim()) {
        this.toasts.error('برای رد کردن رسید باید دلیل بنویسید.');
        return;
      }
    }

    this.reviewing.set(true);
    try {
      this.order.set(await this.service.reviewPayment(order.id, approve, reason));
      this.toasts.success(approve ? 'رسید تأیید شد.' : 'رسید رد شد.');
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.reviewing.set(false);
    }
  }

  protected async viewReceipt(): Promise<void> {
    const order = this.order();
    if (!order?.payment?.hasReceipt) return;

    try {
      const url = await this.service.receiptObjectUrl(order.id);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      this.toasts.error((err as Error).message);
    }
  }
}
